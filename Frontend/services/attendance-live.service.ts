import pool from "@/lib/db";
import { FaceEventInput } from "@/schemas/ai.schema";
import { ingestFaceEvent } from "@/services/ai.service";
import {
  getPresenceState,
  processFaceEvent,
} from "@/services/attendance-engine.service";
import {
  dateOnly,
  getAttendanceEngineConfig,
  isCheckOutWindow,
  isWithinCheckInWindow,
} from "@/services/attendance-settings.service";
import { employeeHasCheckInToday } from "@/services/attendance-engine.service";
import { incrementAIStat, recordServiceRecognition } from "@/services/ai-recognition.service";
import { publishRealtimeEvent } from "@/services/realtime.service";

export interface LiveAttendanceResult {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  department?: string | null;
  confidence: number;
  action: "CHECK_IN" | "CHECK_OUT" | "PRESENT";
  late_minutes: number;
  event_time: string;
  attendance_status?: string;
  check_in?: string | null;
  check_out?: string | null;
}

export async function ingestFaceEventAndMarkAttendance(
  input: FaceEventInput
) {
  if (input.employee_id && input.event_type === "FACE_RECOGNIZED") {
    const config = await getAttendanceEngineConfig();
    const eventDate = new Date(input.event_time);
    const attendanceDate = dateOnly(eventDate);
    const checkedIn = await employeeHasCheckInToday(
      input.employee_id,
      attendanceDate
    );

    if (!checkedIn && !isWithinCheckInWindow(eventDate, config)) {
      return {
        faceEvent: null,
        attendance: null,
        skipped: true,
        skipReason: "before_shift",
      };
    }
  }

  const row = await ingestFaceEvent(input);

  if (!input.employee_id || input.event_type !== "FACE_RECOGNIZED") {
    return { faceEvent: row, attendance: null as LiveAttendanceResult | null };
  }

  const config = await getAttendanceEngineConfig();
  const beforeState = await getPresenceState(
    input.employee_id,
    dateOnly(new Date(input.event_time))
  );
  const hadCheckIn = Boolean(beforeState?.check_in_set);

  const processed = await processFaceEvent(
    {
      id: row.id as number,
      employee_id: input.employee_id,
      camera_id: input.camera_id ?? null,
      location_id: input.location_id ?? null,
      event_time: input.event_time,
      confidence: input.confidence ?? null,
    },
    config
  );

  if (processed.skipped) {
    return {
      faceEvent: row,
      attendance: null,
      skipped: true,
      skipReason: processed.reason,
    };
  }

  const isMovementOnly = Boolean(processed.movementOnly);
  const isNewCheckIn = Boolean(processed.attendanceMarked);
  const isCheckoutUpdate = Boolean(processed.checkoutUpdated);

  await recordServiceRecognition("FACE_RECOGNIZED");

  if (isNewCheckIn || isCheckoutUpdate) {
    await incrementAIStat("attendance_generated");
  }

  const record = await pool.query(
    `
    SELECT
      ar.status,
      ar.late_minutes,
      ar.check_in,
      ar.check_out,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      e.employee_code,
      e.department
    FROM attendance_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.employee_id = $1
      AND ar.attendance_date = $2::date
    `,
    [
      input.employee_id,
      dateOnly(new Date(input.event_time)),
    ]
  );

  const attendanceRow = record.rows[0];
  let action: LiveAttendanceResult["action"] = "PRESENT";

  if (isNewCheckIn) {
    action = "CHECK_IN";
  } else if (isCheckoutUpdate && attendanceRow?.check_out) {
    action = "CHECK_OUT";
  } else if (!hadCheckIn && attendanceRow?.check_in) {
    action = "CHECK_IN";
  } else if (attendanceRow?.check_out) {
    const checkOutTime = new Date(attendanceRow.check_out).getTime();
    const eventTime = new Date(input.event_time).getTime();
    if (Math.abs(checkOutTime - eventTime) < 120_000) {
      action = "CHECK_OUT";
    }
  }

  const liveResult: LiveAttendanceResult = {
    employee_id: input.employee_id,
    employee_name: String(
      input.metadata?.employee_name || attendanceRow?.employee_name || ""
    ),
    employee_code: String(
      input.metadata?.employee_code || attendanceRow?.employee_code || ""
    ),
    department: attendanceRow?.department
      ? String(attendanceRow.department)
      : null,
    confidence: Number(input.confidence ?? 0),
    action,
    late_minutes: Number(attendanceRow?.late_minutes || 0),
    event_time: input.event_time,
    attendance_status: String(attendanceRow?.status || "PRESENT"),
    check_in: attendanceRow?.check_in
      ? new Date(attendanceRow.check_in as string).toISOString()
      : null,
    check_out: attendanceRow?.check_out
      ? new Date(attendanceRow.check_out as string).toISOString()
      : null,
  };

  if (isMovementOnly) {
    publishRealtimeEvent("attendance.movement_logged", { ...liveResult });
    return {
      faceEvent: row,
      attendance: null,
      skipped: true,
      skipReason: "movement_only",
      movementLogged: true,
      preview: liveResult,
    };
  }

  if (
    !hadCheckIn &&
    !isNewCheckIn &&
    !(await employeeHasCheckInToday(
      input.employee_id,
      dateOnly(new Date(input.event_time))
    ))
  ) {
    return {
      faceEvent: row,
      attendance: null,
      skipped: true,
      skipReason: "check_in_failed",
      preview: liveResult,
    };
  }

  publishRealtimeEvent("attendance.live_marked", { ...liveResult });

  return { faceEvent: row, attendance: liveResult };
}

export async function listLiveAttendanceEvents(limit = 15) {
  const result = await pool.query(
    `
    SELECT
      al.id,
      al.event_type,
      al.event_time,
      al.source,
      e.employee_code,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      ar.status,
      ar.late_minutes,
      ar.check_in,
      ar.check_out,
      c.camera_name
    FROM attendance_logs al
    JOIN employees e ON e.id = al.employee_id
    LEFT JOIN attendance_records ar
      ON ar.employee_id = al.employee_id
      AND ar.attendance_date = al.event_time::date
    LEFT JOIN cameras c ON c.id = al.camera_id
    WHERE al.source = 'AI_FACE_RECOGNITION'
      AND al.event_time::date = CURRENT_DATE
    ORDER BY al.event_time DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}
