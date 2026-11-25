import pool from "@/lib/db";
import type { PoolClient } from "pg";
import {
  AttendanceEngineConfig,
  AttendanceDayStatus,
} from "@/types/phase9";
import {
  dateOnly,
  getAttendanceEngineConfig,
  isCheckOutWindow,
  minutesBetween,
  minutesOfDay,
  timeOnDate,
  todayDateOnly,
} from "@/services/attendance-settings.service";
import { employeeCanBeFaceScanned } from "@/services/employee-encoding-cache.service";

export function resolveCheckInStatus(
  eventTime: Date,
  config: AttendanceEngineConfig
) {
  const eventMinutes = minutesOfDay(eventTime);
  const onTimeStart =
    config.onTimeStartHour * 60 + config.onTimeStartMinute;
  const onTimeEnd =
    config.onTimeEndHour * 60 + config.onTimeEndMinute;

  if (eventMinutes >= onTimeStart && eventMinutes <= onTimeEnd) {
    return { recordStatus: "PRESENT" as const, lateMinutes: 0 };
  }

  if (eventMinutes > onTimeEnd) {
    return {
      recordStatus: "LATE" as const,
      lateMinutes: eventMinutes - onTimeEnd,
    };
  }

  return { recordStatus: "PRESENT" as const, lateMinutes: 0 };
}

export function isCheckOutCandidate(
  eventTime: Date,
  config: AttendanceEngineConfig
) {
  const eventMinutes = minutesOfDay(eventTime);
  const cutoff =
    config.checkOutAfterHour * 60 + config.checkOutAfterMinute;
  return eventMinutes >= cutoff;
}

export async function insertPresenceLog(input: {
  employeeId: number;
  cameraId?: number | null;
  locationId?: number | null;
  eventType: "IN" | "OUT";
  eventTime: Date;
  faceEventId?: number | null;
  client?: PoolClient;
}) {
  const sql = `
    INSERT INTO employee_presence_logs (
      employee_id,
      camera_id,
      location_id,
      event_type,
      event_time,
      source,
      face_event_id
    )
    VALUES ($1, $2, $3, $4, $5, 'AI_FACE_RECOGNITION', $6)
    RETURNING id
  `;
  const values = [
    input.employeeId,
    input.cameraId || null,
    input.locationId || null,
    input.eventType,
    input.eventTime,
    input.faceEventId || null,
  ];

  const result = input.client
    ? await input.client.query(sql, values)
    : await pool.query(sql, values);

  return result.rows[0].id as number;
}

async function getCameraEntryExitType(cameraId: number | null) {
  if (!cameraId) return "NONE";
  const result = await pool.query(
    `SELECT entry_exit_type FROM cameras WHERE id = $1`,
    [cameraId]
  );
  return String(result.rows[0]?.entry_exit_type || "NONE");
}

function resolvePresenceEventType(
  entryExitType: string,
  isInside: boolean
): "IN" | "OUT" {
  switch (entryExitType) {
    case "ENTRY":
      return "IN";
    case "EXIT":
      return "OUT";
    case "BOTH":
      return isInside ? "OUT" : "IN";
    default:
      return "IN";
  }
}

export async function getPresenceLogsForDay(
  employeeId: number,
  attendanceDate: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM employee_presence_logs
    WHERE employee_id = $1
      AND event_time::date = $2::date
    ORDER BY event_time ASC
    `,
    [employeeId, attendanceDate]
  );

  return result.rows;
}

export async function getPresenceState(
  employeeId: number,
  attendanceDate: string
) {
  const result = await pool.query(
    `
    SELECT *
    FROM employee_presence_state
    WHERE employee_id = $1 AND attendance_date = $2
    `,
    [employeeId, attendanceDate]
  );

  return result.rows[0] || null;
}

export async function upsertPresenceState(input: {
  employeeId: number;
  attendanceDate: string;
  isInside: boolean;
  lastSeenAt: Date;
  lastCameraId?: number | null;
  lastLocationId?: number | null;
  checkInSet?: boolean;
}) {
  await pool.query(
    `
    INSERT INTO employee_presence_state (
      employee_id,
      attendance_date,
      is_inside,
      last_seen_at,
      last_camera_id,
      last_location_id,
      check_in_set
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (employee_id, attendance_date)
    DO UPDATE SET
      is_inside = EXCLUDED.is_inside,
      last_seen_at = EXCLUDED.last_seen_at,
      last_camera_id = EXCLUDED.last_camera_id,
      last_location_id = EXCLUDED.last_location_id,
      check_in_set = employee_presence_state.check_in_set OR EXCLUDED.check_in_set
    `,
    [
      input.employeeId,
      input.attendanceDate,
      input.isInside,
      input.lastSeenAt,
      input.lastCameraId || null,
      input.lastLocationId || null,
      input.checkInSet || false,
    ]
  );
}

export function calculatePresenceDurations(
  logs: Array<{ event_type: string; event_time: string | Date }>
) {
  let insideMinutes = 0;
  let outsideMinutes = 0;
  let entries = 0;
  let exits = 0;
  let openIn: Date | null = null;

  for (const log of logs) {
    const eventTime = new Date(log.event_time);
    if (log.event_type === "IN") {
      entries += 1;
      if (openIn) {
        outsideMinutes += minutesBetween(openIn, eventTime);
      }
      openIn = eventTime;
    } else if (log.event_type === "OUT" && openIn) {
      exits += 1;
      insideMinutes += minutesBetween(openIn, eventTime);
      openIn = null;
    }
  }

  if (openIn && logs.length > 0) {
    const lastTime = new Date(logs[logs.length - 1].event_time);
    insideMinutes += minutesBetween(openIn, lastTime);
  }

  const workingMinutes = Math.max(0, insideMinutes - outsideMinutes);

  return {
    totalInsideMinutes: insideMinutes,
    totalOutsideMinutes: outsideMinutes,
    workingMinutes,
    entries,
    exits,
  };
}

export function resolveAttendanceDayStatus(input: {
  hasDetection: boolean;
  workingMinutes: number;
  checkOut: Date | null;
  lastDetection: Date | null;
  config: AttendanceEngineConfig;
}): AttendanceDayStatus {
  if (!input.hasDetection) return "ABSENT";

  const standardMinutes = input.config.standardWorkHours * 60;
  const halfDayCutoff = timeOnDate(
    input.lastDetection || new Date(),
    input.config.halfDayCutoffHour,
    input.config.halfDayCutoffMinute
  );

  const checkoutCutoff = timeOnDate(
    input.lastDetection || new Date(),
    input.config.checkOutAfterHour,
    input.config.checkOutAfterMinute
  );

  const fullDay =
    input.workingMinutes >= standardMinutes &&
    !!input.checkOut &&
    input.checkOut >= checkoutCutoff;

  if (fullDay) return "FULL_DAY";

  const halfDay =
    input.workingMinutes < standardMinutes ||
    !input.lastDetection ||
    input.lastDetection < halfDayCutoff;

  if (halfDay) return "HALF_DAY";

  return "FULL_DAY";
}

export async function computeWorkingMetrics(
  employeeId: number,
  attendanceDate: string,
  config?: AttendanceEngineConfig
) {
  const engineConfig = config || (await getAttendanceEngineConfig());
  const logs = await getPresenceLogsForDay(employeeId, attendanceDate);
  const durations = calculatePresenceDurations(logs);

  const record = await pool.query(
    `
    SELECT check_in, check_out
    FROM attendance_records
    WHERE employee_id = $1 AND attendance_date = $2::date
    LIMIT 1
    `,
    [employeeId, attendanceDate]
  );

  const checkIn = record.rows[0]?.check_in
    ? new Date(record.rows[0].check_in)
    : null;
  const checkOut = record.rows[0]?.check_out
    ? new Date(record.rows[0].check_out)
    : null;

  let workingMinutes = durations.workingMinutes;
  if (checkIn && workingMinutes <= 0) {
    const end = checkOut || new Date();
    workingMinutes = Math.max(0, minutesBetween(checkIn, end));
  }

  const overtimeMinutes = Math.max(
    0,
    workingMinutes - engineConfig.standardWorkHours * 60
  );

  return {
    totalInsideMinutes:
      durations.totalInsideMinutes > 0
        ? durations.totalInsideMinutes
        : workingMinutes,
    totalOutsideMinutes: durations.totalOutsideMinutes,
    workingMinutes,
    overtimeMinutes,
    workingHours: Number((workingMinutes / 60).toFixed(2)),
    entries: durations.entries || (checkIn ? 1 : 0),
    exits: durations.exits,
  };
}

interface FaceEventRow {
  id: number;
  employee_id: number;
  camera_id: number | null;
  location_id: number | null;
  event_time: string;
  confidence: number | null;
}

async function ensureCheckIn(
  client: PoolClient,
  input: {
    employeeId: number;
    locationId: number | null;
    attendanceDate: string;
    eventTime: Date;
    config: AttendanceEngineConfig;
    cameraId?: number | null;
  }
) {
  const { recordStatus, lateMinutes } = resolveCheckInStatus(
    input.eventTime,
    input.config
  );

  await client.query(
    `
    INSERT INTO attendance_logs (
      employee_id, location_id, event_type, event_time, source, camera_id
    )
    VALUES ($1, $2, 'CHECK_IN', $3, 'AI_FACE_RECOGNITION', $4)
    `,
    [
      input.employeeId,
      input.locationId,
      input.eventTime,
      input.cameraId || null,
    ]
  );

  await client.query(
    `
    INSERT INTO attendance_records (
      employee_id, location_id, attendance_date, check_in, status, late_minutes, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    ON CONFLICT (employee_id, attendance_date)
    DO UPDATE SET
      check_in = COALESCE(attendance_records.check_in, EXCLUDED.check_in),
      location_id = COALESCE(attendance_records.location_id, EXCLUDED.location_id),
      status = CASE
        WHEN attendance_records.check_in IS NULL THEN EXCLUDED.status
        ELSE attendance_records.status
      END,
      late_minutes = CASE
        WHEN attendance_records.check_in IS NULL THEN EXCLUDED.late_minutes
        ELSE attendance_records.late_minutes
      END,
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      input.employeeId,
      input.locationId,
      input.attendanceDate,
      input.eventTime,
      recordStatus,
      lateMinutes,
    ]
  );
}

async function updateCheckOut(
  client: PoolClient,
  input: {
    employeeId: number;
    attendanceDate: string;
    eventTime: Date;
    config: AttendanceEngineConfig;
  }
) {
  if (!isCheckOutCandidate(input.eventTime, input.config)) return;

  await client.query(
    `
    UPDATE attendance_records
    SET check_out = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = $2 AND attendance_date = $3
      AND check_in IS NOT NULL
      AND (check_out IS NULL OR check_out < $1)
    `,
    [input.eventTime, input.employeeId, input.attendanceDate]
  );
}

async function hasDailyCheckIn(
  client: PoolClient,
  employeeId: number,
  attendanceDate: string
) {
  const existing = await client.query(
    `
    SELECT check_in FROM attendance_records
    WHERE employee_id = $1 AND attendance_date = $2
    `,
    [employeeId, attendanceDate]
  );
  return Boolean(existing.rows[0]?.check_in);
}

export async function employeeHasCheckInToday(
  employeeId: number,
  attendanceDate?: string
) {
  const date = attendanceDate || dateOnly(new Date());
  const result = await pool.query(
    `
    SELECT check_in
    FROM attendance_records
    WHERE employee_id = $1 AND attendance_date = $2::date
    LIMIT 1
    `,
    [employeeId, date]
  );
  return Boolean(result.rows[0]?.check_in);
}

export async function syncSummaryForDay(
  employeeId: number,
  attendanceDate: string,
  config: AttendanceEngineConfig
) {
  const record = await pool.query(
    `
    SELECT * FROM attendance_records
    WHERE employee_id = $1 AND attendance_date = $2
    `,
    [employeeId, attendanceDate]
  );

  const metrics = await computeWorkingMetrics(
    employeeId,
    attendanceDate,
    config
  );

  const checkIn = record.rows[0]?.check_in
    ? new Date(record.rows[0].check_in)
    : null;
  const checkOut = record.rows[0]?.check_out
    ? new Date(record.rows[0].check_out)
    : null;

  const lastDetection = await pool.query(
    `
    SELECT MAX(event_time) AS last_detection
    FROM face_events
    WHERE employee_id = $1 AND event_time::date = $2::date
    `,
    [employeeId, attendanceDate]
  );

  const lastDet = lastDetection.rows[0]?.last_detection
    ? new Date(lastDetection.rows[0].last_detection)
    : null;

  const attendanceStatus = resolveAttendanceDayStatus({
    hasDetection: !!checkIn || metrics.entries > 0,
    workingMinutes: metrics.workingMinutes,
    checkOut,
    lastDetection: lastDet,
    config,
  });

  const overtimeHours = Number((metrics.overtimeMinutes / 60).toFixed(2));
  const checkoutCutoffMinutes =
    config.checkOutAfterHour * 60 + config.checkOutAfterMinute;
  const checkOutMinutes = checkOut ? minutesOfDay(checkOut) : null;
  const earlyExit =
    !!checkIn &&
    checkOutMinutes != null &&
    checkOutMinutes < checkoutCutoffMinutes &&
    checkOutMinutes >= config.onTimeEndHour * 60 + config.onTimeEndMinute;

  const earlyExitMinutes =
    earlyExit && checkOutMinutes != null
      ? Math.max(0, checkoutCutoffMinutes - checkOutMinutes)
      : 0;

  let recordStatus =
    record.rows[0]?.status === "LATE"
      ? "LATE"
      : attendanceStatus === "ABSENT"
        ? "ABSENT"
        : earlyExit
          ? "EARLY_EXIT"
          : metrics.overtimeMinutes > 0
            ? "OVERTIME"
            : "PRESENT";

  await pool.query(
    `
    INSERT INTO attendance_summary (
      employee_id, attendance_date, check_in, check_out,
      working_hours, total_inside_minutes, total_outside_minutes,
      working_minutes, overtime_minutes, outside_duration,
      entries, exits, attendance_status, late_minutes, location_id, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP)
    ON CONFLICT (employee_id, attendance_date)
    DO UPDATE SET
      check_in = COALESCE(attendance_summary.check_in, EXCLUDED.check_in),
      check_out = CASE
        WHEN EXCLUDED.check_out IS NULL THEN attendance_summary.check_out
        WHEN attendance_summary.check_out IS NULL THEN EXCLUDED.check_out
        WHEN EXCLUDED.check_out > attendance_summary.check_out THEN EXCLUDED.check_out
        ELSE attendance_summary.check_out
      END,
      working_hours = EXCLUDED.working_hours,
      total_inside_minutes = EXCLUDED.total_inside_minutes,
      total_outside_minutes = EXCLUDED.total_outside_minutes,
      working_minutes = EXCLUDED.working_minutes,
      overtime_minutes = EXCLUDED.overtime_minutes,
      outside_duration = EXCLUDED.outside_duration,
      entries = EXCLUDED.entries,
      exits = EXCLUDED.exits,
      attendance_status = EXCLUDED.attendance_status,
      late_minutes = EXCLUDED.late_minutes,
      location_id = COALESCE(attendance_summary.location_id, EXCLUDED.location_id),
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      employeeId,
      attendanceDate,
      checkIn,
      checkOut,
      metrics.workingHours,
      metrics.totalInsideMinutes,
      metrics.totalOutsideMinutes,
      metrics.workingMinutes,
      metrics.overtimeMinutes,
      metrics.totalOutsideMinutes,
      metrics.entries,
      metrics.exits,
      attendanceStatus,
      record.rows[0]?.late_minutes || 0,
      record.rows[0]?.location_id || null,
    ]
  );

  if (record.rows[0]) {
    await pool.query(
      `
      UPDATE attendance_records
      SET working_hours = $1,
          overtime_hours = $2,
          total_inside_minutes = $3,
          total_outside_minutes = $4,
          working_minutes = $5,
          overtime_minutes = $6,
          entries = $7,
          exits = $8,
          attendance_status = $9,
          status = $10,
          early_exit_minutes = $11,
          updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $12 AND attendance_date = $13
      `,
      [
        metrics.workingHours,
        overtimeHours,
        metrics.totalInsideMinutes,
        metrics.totalOutsideMinutes,
        metrics.workingMinutes,
        metrics.overtimeMinutes,
        metrics.entries,
        metrics.exits,
        attendanceStatus,
        recordStatus,
        earlyExitMinutes,
        employeeId,
        attendanceDate,
      ]
    );
  }
}

export async function processFaceEvent(
  event: FaceEventRow,
  config: AttendanceEngineConfig
) {
  if (!event.employee_id) return { processed: false };

  const employeeRow = await pool.query(
    `SELECT location_id FROM employees WHERE id = $1 AND COALESCE(status, 'ACTIVE') = 'ACTIVE'`,
    [event.employee_id]
  );
  if (!employeeRow.rows[0]) {
    await pool.query(
      `UPDATE face_events SET processed = TRUE WHERE id = $1`,
      [event.id]
    );
    return { processed: true, skipped: true, reason: "employee_inactive" };
  }

  if (!(await employeeCanBeFaceScanned(event.employee_id))) {
    await pool.query(
      `UPDATE face_events SET processed = TRUE WHERE id = $1`,
      [event.id]
    );
    return { processed: true, skipped: true, reason: "no_face_registered" };
  }

  const employeeLocationId = employeeRow.rows[0].location_id as number | null;
  const effectiveLocationId =
    event.location_id && employeeLocationId && event.location_id !== employeeLocationId
      ? employeeLocationId
      : event.location_id ?? employeeLocationId;

  // Match-time confidence is validated in the recognition service.
  const eventTime = new Date(event.event_time);
  const attendanceDate = dateOnly(eventTime);
  const entryExitType = await getCameraEntryExitType(event.camera_id);
  const state = await getPresenceState(event.employee_id, attendanceDate);
  const hadCheckInBefore = await employeeHasCheckInToday(
    event.employee_id,
    attendanceDate
  );
  const inCheckoutWindow = isCheckOutWindow(eventTime, config);

  const isInside = Boolean(state?.is_inside);
  const presenceType = resolvePresenceEventType(entryExitType, isInside);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (entryExitType === "NONE" && isInside && state?.last_seen_at) {
      const gap = minutesBetween(new Date(state.last_seen_at), eventTime);
      if (gap > config.presenceGapMinutes) {
        const outTime = new Date(state.last_seen_at);
        outTime.setMinutes(outTime.getMinutes() + config.presenceGapMinutes);
        await insertPresenceLog({
          employeeId: event.employee_id,
          cameraId: state.last_camera_id,
          locationId: state.last_location_id,
          eventType: "OUT",
          eventTime: outTime,
          client,
        });
      }
    }

    await insertPresenceLog({
      employeeId: event.employee_id,
      cameraId: event.camera_id,
      locationId: effectiveLocationId,
      eventType: presenceType,
      eventTime,
      faceEventId: event.id,
      client,
    });

    const alreadyCheckedIn = await hasDailyCheckIn(
      client,
      event.employee_id,
      attendanceDate
    );

    let attendanceMarked = false;
    if (!alreadyCheckedIn) {
      await ensureCheckIn(client, {
        employeeId: event.employee_id,
        locationId: effectiveLocationId,
        attendanceDate,
        eventTime,
        config,
        cameraId: event.camera_id,
      });
      attendanceMarked = await hasDailyCheckIn(
        client,
        event.employee_id,
        attendanceDate
      );
    }

    const checkoutBefore = await client.query(
      `SELECT check_out FROM attendance_records WHERE employee_id = $1 AND attendance_date = $2`,
      [event.employee_id, attendanceDate]
    );
    const prevCheckOut = checkoutBefore.rows[0]?.check_out
      ? new Date(checkoutBefore.rows[0].check_out as string).getTime()
      : null;

    await updateCheckOut(client, {
      employeeId: event.employee_id,
      attendanceDate,
      eventTime,
      config,
    });

    await client.query(
      `UPDATE face_events SET processed = TRUE WHERE id = $1`,
      [event.id]
    );

    await client.query("COMMIT");

    await upsertPresenceState({
      employeeId: event.employee_id,
      attendanceDate,
      isInside: presenceType === "IN",
      lastSeenAt: eventTime,
      lastCameraId: event.camera_id,
      lastLocationId: effectiveLocationId,
      checkInSet: hadCheckInBefore || attendanceMarked,
    });

    await syncSummaryForDay(event.employee_id, attendanceDate, config);

    const checkoutAfter = await pool.query(
      `SELECT check_out FROM attendance_records WHERE employee_id = $1 AND attendance_date = $2`,
      [event.employee_id, attendanceDate]
    );
    const newCheckOut = checkoutAfter.rows[0]?.check_out
      ? new Date(checkoutAfter.rows[0].check_out as string).getTime()
      : null;
    const checkoutUpdated =
      hadCheckInBefore &&
      inCheckoutWindow &&
      newCheckOut != null &&
      newCheckOut !== prevCheckOut;

    return {
      processed: true,
      attendanceMarked,
      movementOnly: hadCheckInBefore && !attendanceMarked && !inCheckoutWindow,
      checkoutUpdated,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeDailyCheckOuts(
  attendanceDate: string,
  config: AttendanceEngineConfig
) {
  const cutoff = timeOnDate(
    new Date(`${attendanceDate}T12:00:00`),
    config.checkOutAfterHour,
    config.checkOutAfterMinute
  );

  const result = await pool.query(
    `
    WITH last_recognition AS (
      SELECT
        fe.employee_id,
        MAX(fe.event_time) AS last_event
      FROM face_events fe
      WHERE fe.event_time::date = $1::date
        AND fe.employee_id IS NOT NULL
        AND fe.event_type = 'FACE_RECOGNIZED'
        AND fe.event_time >= $2
      GROUP BY fe.employee_id
    )
    UPDATE attendance_records ar
    SET check_out = lr.last_event,
        updated_at = CURRENT_TIMESTAMP
    FROM last_recognition lr
    WHERE ar.employee_id = lr.employee_id
      AND ar.attendance_date = $1::date
      AND ar.check_in IS NOT NULL
      AND (ar.check_out IS NULL OR ar.check_out < lr.last_event)
    RETURNING ar.employee_id
    `,
    [attendanceDate, cutoff]
  );

  for (const row of result.rows) {
    await syncSummaryForDay(row.employee_id as number, attendanceDate, config);
  }

  return result.rows.length;
}

export async function finalizeAbsentEmployees(
  attendanceDate: string,
  config: AttendanceEngineConfig
) {
  const result = await pool.query(
    `
    SELECT e.id, e.location_id
    FROM employees e
    WHERE e.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM face_events fe
        WHERE fe.employee_id = e.id
          AND fe.event_time::date = $1::date
          AND fe.processed = TRUE
      )
    `,
    [attendanceDate]
  );

  for (const row of result.rows) {
    await pool.query(
      `
      INSERT INTO attendance_summary (
        employee_id, attendance_date, attendance_status, location_id, updated_at
      )
      VALUES ($1, $2, 'ABSENT', $3, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id, attendance_date)
      DO UPDATE SET
        attendance_status = 'ABSENT',
        updated_at = CURRENT_TIMESTAMP
      `,
      [row.id, attendanceDate, row.location_id]
    );
  }

  return result.rows.length;
}

export async function processPendingFaceEvents(options: {
  limit?: number;
  date?: string;
  finalizeAbsent?: boolean;
} = {}) {
  const config = await getAttendanceEngineConfig();
  const limit = options.limit || 500;
  const targetDate = options.date || todayDateOnly();

  const run = await pool.query(
    `
    INSERT INTO attendance_engine_runs (run_type, status)
    VALUES ('PROCESS_FACE_EVENTS', 'RUNNING')
    RETURNING id
    `
  );
  const runId = run.rows[0].id as number;

  let eventsProcessed = 0;
  let recordsUpdated = 0;

  try {
    const pending = await pool.query(
      `
      SELECT id, employee_id, camera_id, location_id, event_time, confidence
      FROM face_events
      WHERE processed = FALSE
        AND employee_id IS NOT NULL
      ORDER BY event_time ASC
      LIMIT $1
      `,
      [limit]
    );

    for (const event of pending.rows as FaceEventRow[]) {
      const result = await processFaceEvent(event, config);
      if (result.processed) {
        eventsProcessed += 1;
        if (!result.skipped) recordsUpdated += 1;
      }
    }

    let summariesUpdated = 0;
    if (options.finalizeAbsent !== false) {
      summariesUpdated = await finalizeAbsentEmployees(targetDate, config);
    }

    const checkoutsFinalized = await finalizeDailyCheckOuts(targetDate, config);

    await pool.query(
      `
      UPDATE attendance_engine_runs
      SET status = 'COMPLETED',
          events_processed = $1,
          records_updated = $2,
          summaries_updated = $3,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [eventsProcessed, recordsUpdated, summariesUpdated, runId]
    );

    return {
      runId,
      eventsProcessed,
      recordsUpdated,
      summariesUpdated,
      checkoutsFinalized,
      pendingRemaining: pending.rows.length - eventsProcessed,
    };
  } catch (error) {
    await pool.query(
      `
      UPDATE attendance_engine_runs
      SET status = 'FAILED',
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [error instanceof Error ? error.message : "Unknown error", runId]
    );
    throw error;
  }
}

export async function getAttendanceSummaries(filters: {
  date?: string;
  locationId?: number;
  employeeId?: number;
  status?: string;
} = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.date) {
    conditions.push(`asum.attendance_date = $${idx++}`);
    values.push(filters.date);
  }
  if (filters.locationId) {
    conditions.push(`asum.location_id = $${idx++}`);
    values.push(filters.locationId);
  }
  if (filters.employeeId) {
    conditions.push(`asum.employee_id = $${idx++}`);
    values.push(filters.employeeId);
  }
  if (filters.status) {
    conditions.push(`asum.attendance_status = $${idx++}`);
    values.push(filters.status);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      asum.*,
      e.employee_code,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      l.location_name
    FROM attendance_summary asum
    JOIN employees e ON e.id = asum.employee_id
    LEFT JOIN locations l ON l.id = asum.location_id
    ${where}
    ORDER BY asum.attendance_date DESC, asum.check_in DESC NULLS LAST
    LIMIT 200
    `,
    values
  );

  return result.rows;
}

export async function getEmployeeEngineDashboard(date?: string) {
  const targetDate = date || todayDateOnly();

  const stats = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE attendance_status IN ('FULL_DAY', 'HALF_DAY'))::int AS present,
      COUNT(*) FILTER (WHERE attendance_status = 'ABSENT')::int AS absent,
      COUNT(*) FILTER (WHERE late_minutes > 0)::int AS late,
      COUNT(*) FILTER (WHERE attendance_status = 'HALF_DAY')::int AS half_day,
      COALESCE(ROUND(AVG(working_hours)::numeric, 2), 0)::float AS avg_working_hours
    FROM attendance_summary
    WHERE attendance_date = $1
    `,
    [targetDate]
  );

  const summaries = await getAttendanceSummaries({ date: targetDate });
  const movement = await pool.query(
    `
    SELECT epl.*, e.employee_code
    FROM employee_presence_logs epl
    JOIN employees e ON e.id = epl.employee_id
    WHERE epl.event_time::date = $1::date
    ORDER BY epl.event_time DESC
    LIMIT 50
    `,
    [targetDate]
  );

  return {
    ...stats.rows[0],
    summaries,
    movement_logs: movement.rows,
  };
}

export async function getCameraEngineDashboard(date?: string) {
  const targetDate = date || todayDateOnly();

  const health = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_cameras,
      COUNT(*) FILTER (WHERE health_status = 'ONLINE')::int AS online,
      COUNT(*) FILTER (WHERE health_status != 'ONLINE' OR health_status IS NULL)::int AS offline
    FROM cameras
    `
  );

  const cameraWise = await pool.query(
    `
    SELECT
      c.id AS camera_id,
      c.camera_name,
      l.location_name,
      c.health_status,
      COUNT(fe.id)::int AS detections,
      COUNT(DISTINCT fe.employee_id)::int AS unique_employees
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN face_events fe ON fe.camera_id = c.id AND fe.event_time::date = $1::date
    GROUP BY c.id, c.camera_name, l.location_name, c.health_status
    ORDER BY detections DESC
    `,
    [targetDate]
  );

  const activity = await pool.query(
    `
    SELECT
      c.camera_name,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      fe.event_time,
      fe.confidence
    FROM face_events fe
    LEFT JOIN cameras c ON c.id = fe.camera_id
    LEFT JOIN employees e ON e.id = fe.employee_id
    WHERE fe.event_time::date = $1::date
    ORDER BY fe.event_time DESC
    LIMIT 20
    `,
    [targetDate]
  );

  const activeEmployees = await pool.query(
    `
    SELECT COUNT(DISTINCT employee_id)::int AS active_employees
    FROM face_events
    WHERE event_time::date = $1::date AND employee_id IS NOT NULL
    `,
    [targetDate]
  );

  return {
    ...health.rows[0],
    active_employees: activeEmployees.rows[0]?.active_employees || 0,
    camera_wise_attendance: cameraWise.rows,
    recent_activity: activity.rows,
  };
}

export async function getLocationEngineDashboard(date?: string) {
  const targetDate = date || todayDateOnly();

  const result = await pool.query(
    `
    SELECT
      l.id AS location_id,
      l.location_name,
      COUNT(DISTINCT e.id)::int AS employee_count,
      COUNT(DISTINCT c.id)::int AS camera_count,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
      )::int AS present_today,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.attendance_status = 'ABSENT'
      )::int AS absent_today,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.late_minutes > 0
      )::int AS late_today
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id AND e.status = 'ACTIVE'
    LEFT JOIN cameras c ON c.location_id = l.id
    LEFT JOIN attendance_summary asum ON asum.location_id = l.id
      AND asum.attendance_date = $1
    GROUP BY l.id, l.location_name
    ORDER BY l.location_name
    `,
    [targetDate]
  );

  return { locations: result.rows };
}

export async function getPresenceLogs(filters: {
  employeeId?: number;
  date?: string;
  limit?: number;
} = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.employeeId) {
    conditions.push(`epl.employee_id = $${idx++}`);
    values.push(filters.employeeId);
  }
  if (filters.date) {
    conditions.push(`epl.event_time::date = $${idx++}::date`);
    values.push(filters.date);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(Math.min(200, filters.limit || 100));

  const result = await pool.query(
    `
    SELECT
      epl.*,
      e.employee_code,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      c.camera_name,
      l.location_name
    FROM employee_presence_logs epl
    JOIN employees e ON e.id = epl.employee_id
    LEFT JOIN cameras c ON c.id = epl.camera_id
    LEFT JOIN locations l ON l.id = epl.location_id
    ${where}
    ORDER BY epl.event_time DESC
    LIMIT $${idx}
    `,
    values
  );

  return result.rows;
}
