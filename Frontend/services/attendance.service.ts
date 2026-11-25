import pool from "@/lib/db";
import { createNotification } from "@/services/notification.service";
import { publishRealtimeEvent } from "@/services/realtime.service";
import {
  syncSummaryForDay,
} from "@/services/attendance-engine.service";
import {
  dateOnly,
  getAttendanceEngineConfig,
} from "@/services/attendance-settings.service";
import {
  AttendanceDashboardStats,
  AttendanceFilters,
  AttendanceRecord,
} from "@/types/attendance";
import { toDateOnlyInTimezone } from "@/utils/timezone";

const SHIFT_START_HOUR = 9;
const SHIFT_END_HOUR = 18;
const LATE_GRACE_MINUTES = 15;
const STANDARD_WORK_HOURS = 8;

interface Scope {
  managerLocationId?: number | null;
  employeeId?: number | null;
}

interface AttendanceEventOptions {
  employeeId: number;
  eventTime?: string;
  source?: "MANUAL" | "CAMERA" | "AI_FACE_RECOGNITION";
  cameraId?: number | null;
}

const RECORD_SELECT = `
  SELECT
    ar.id,
    ar.employee_id,
    e.employee_code,
    TRIM(CONCAT(
      COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
      ' ',
      COALESCE(e.last_name, '')
    )) AS employee_name,
    ar.location_id,
    l.location_name,
    ar.attendance_date,
    ar.check_in,
    ar.check_out,
    COALESCE(ar.working_hours, 0)::float AS working_hours,
    COALESCE(ar.overtime_hours, 0)::float AS overtime_hours,
    COALESCE(ar.status, 'PRESENT') AS status,
    COALESCE(ar.late_minutes, 0)::int AS late_minutes,
    COALESCE(ar.early_exit_minutes, 0)::int AS early_exit_minutes,
    ar.created_at,
    ar.updated_at
  FROM attendance_records ar
  JOIN employees e ON e.id = ar.employee_id
  LEFT JOIN locations l ON l.id = ar.location_id
`;

function normalizeAttendanceDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    return toDateOnlyInTimezone(value);
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toDateOnlyInTimezone(parsed);
  }
  return raw;
}

function mapRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as number,
    employee_id: row.employee_id as number,
    employee_code: row.employee_code as string,
    employee_name: row.employee_name as string,
    location_id: (row.location_id as number) || null,
    location_name: (row.location_name as string) || null,
    attendance_date: normalizeAttendanceDate(row.attendance_date),
    check_in: row.check_in ? String(row.check_in) : null,
    check_out: row.check_out ? String(row.check_out) : null,
    working_hours: Number(row.working_hours || 0),
    overtime_hours: Number(row.overtime_hours || 0),
    status: row.status as AttendanceRecord["status"],
    late_minutes: Number(row.late_minutes || 0),
    early_exit_minutes: Number(row.early_exit_minutes || 0),
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

function localDateOnly(date: Date) {
  return dateOnly(date);
}

function shiftTime(date: Date, hour: number) {
  const shifted = new Date(date);
  shifted.setHours(hour, 0, 0, 0);
  return shifted;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / 60000)
  );
}

async function getEmployeeLocation(employeeId: number) {
  const result = await pool.query(
    `
    SELECT id, location_id
    FROM employees
    WHERE id = $1
    `,
    [employeeId]
  );

  return result.rows[0] || null;
}

function applyScope(
  conditions: string[],
  values: unknown[],
  scope: Scope,
  tableAlias = "ar"
) {
  let paramIndex = values.length + 1;

  if (scope.managerLocationId) {
    conditions.push(
      `${tableAlias}.location_id = $${paramIndex++}`
    );
    values.push(scope.managerLocationId);
  }

  if (scope.employeeId) {
    conditions.push(
      `${tableAlias}.employee_id = $${paramIndex++}`
    );
    values.push(scope.employeeId);
  }
}

export async function getAttendanceRecords(
  filters: AttendanceFilters = {},
  scope: Scope = {}
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  applyScope(conditions, values, scope);
  paramIndex = values.length + 1;

  if (filters.search) {
    conditions.push(`(
      e.employee_code ILIKE $${paramIndex} OR
      e.first_name ILIKE $${paramIndex} OR
      e.last_name ILIKE $${paramIndex} OR
      e.name ILIKE $${paramIndex}
    )`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.status) {
    conditions.push(`ar.status = $${paramIndex++}`);
    values.push(filters.status);
  }

  if (filters.from) {
    conditions.push(`ar.attendance_date >= $${paramIndex++}`);
    values.push(filters.from);
  }

  if (filters.to) {
    conditions.push(`ar.attendance_date <= $${paramIndex++}`);
    values.push(filters.to);
  }

  if (filters.location_id) {
    conditions.push(`ar.location_id = $${paramIndex++}`);
    values.push(filters.location_id);
  }

  if (filters.employee_id) {
    conditions.push(`ar.employee_id = $${paramIndex++}`);
    values.push(filters.employee_id);
  }

  // Hide test/future-dated rows unless an explicit date filter is set.
  if (!filters.from && !filters.to) {
    conditions.push(`ar.attendance_date <= CURRENT_DATE`);
    conditions.push(
      `ar.attendance_date >= CURRENT_DATE - INTERVAL '1 year'`
    );
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const result = await pool.query(
    `
    ${RECORD_SELECT}
    ${whereClause}
    ORDER BY ar.attendance_date DESC, ar.check_in DESC NULLS LAST
    LIMIT 200
    `,
    values
  );

  return result.rows.map(mapRecord);
}

export async function getAttendanceDashboard(
  scope: Scope = {}
) {
  const conditions = [
    "ar.attendance_date >= CURRENT_DATE - INTERVAL '90 days'",
    "ar.attendance_date <= CURRENT_DATE",
  ];
  const values: unknown[] = [];
  applyScope(conditions, values, scope);

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const statsResult = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_records,
      COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'OVERTIME'))::int AS present,
      COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late,
      COUNT(*) FILTER (WHERE ar.status = 'EARLY_EXIT')::int AS early_exit,
      COUNT(*) FILTER (WHERE ar.overtime_hours > 0)::int AS overtime,
      COALESCE(ROUND(AVG(ar.working_hours)::numeric, 2), 0)::float AS avg_working_hours
    FROM attendance_records ar
    ${whereClause}
    `,
    values
  );

  const dailyResult = await pool.query(
    `
    SELECT
      TO_CHAR(ar.attendance_date, 'YYYY-MM-DD') AS attendance_date,
      COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'OVERTIME'))::int AS present,
      COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late,
      COUNT(*) FILTER (WHERE ar.overtime_hours > 0)::int AS overtime
    FROM attendance_records ar
    ${whereClause}
    GROUP BY ar.attendance_date
    ORDER BY ar.attendance_date ASC
    `,
    values
  );

  const monthlyResult = await pool.query(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', ar.attendance_date), 'YYYY-MM') AS month,
      COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'OVERTIME'))::int AS present,
      COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late,
      COUNT(*) FILTER (WHERE ar.overtime_hours > 0)::int AS overtime
    FROM attendance_records ar
    ${whereClause}
    GROUP BY DATE_TRUNC('month', ar.attendance_date)
    ORDER BY month ASC
    `,
    values
  );

  return {
    stats: statsResult.rows[0] as AttendanceDashboardStats,
    daily: dailyResult.rows,
    monthly: monthlyResult.rows,
  };
}

export async function getAttendanceLogs(scope: Scope = {}) {
  const conditions: string[] = [
    "al.event_time <= CURRENT_TIMESTAMP + INTERVAL '1 day'",
    "al.event_time >= CURRENT_TIMESTAMP - INTERVAL '1 year'",
  ];
  const values: unknown[] = [];
  applyScope(conditions, values, scope, "al");

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const result = await pool.query(
    `
    SELECT
      al.id,
      al.employee_id,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      al.location_id,
      l.location_name,
      al.event_type,
      al.event_time,
      al.source,
      al.camera_id,
      c.camera_name,
      al.created_at
    FROM attendance_logs al
    JOIN employees e ON e.id = al.employee_id
    LEFT JOIN locations l ON l.id = al.location_id
    LEFT JOIN cameras c ON c.id = al.camera_id
    ${whereClause}
    ORDER BY al.event_time DESC
    LIMIT 100
    `,
    values
  );

  return result.rows.map((row) => ({
    ...row,
    event_time: row.event_time ? String(row.event_time) : null,
  }));
}

export async function checkIn(options: AttendanceEventOptions) {
  const eventTime = options.eventTime
    ? new Date(options.eventTime)
    : new Date();
  const attendanceDate = localDateOnly(eventTime);
  const employee = await getEmployeeLocation(options.employeeId);

  if (!employee) return null;

  const lateThreshold = shiftTime(eventTime, SHIFT_START_HOUR);
  lateThreshold.setMinutes(LATE_GRACE_MINUTES);
  const lateMinutes =
    eventTime > lateThreshold
      ? minutesBetween(lateThreshold, eventTime)
      : 0;

  const status = lateMinutes > 0 ? "LATE" : "PRESENT";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO attendance_logs (
        employee_id,
        location_id,
        event_type,
        event_time,
        source,
        camera_id
      )
      VALUES ($1, $2, 'CHECK_IN', $3, $4, $5)
      `,
      [
        options.employeeId,
        employee.location_id,
        eventTime,
        options.source || "MANUAL",
        options.cameraId || null,
      ]
    );

    const record = await client.query(
      `
      INSERT INTO attendance_records (
        employee_id,
        location_id,
        attendance_date,
        check_in,
        status,
        late_minutes,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id, attendance_date)
      DO UPDATE SET
        check_in = COALESCE(attendance_records.check_in, EXCLUDED.check_in),
        status = CASE
          WHEN attendance_records.status = 'PRESENT' THEN EXCLUDED.status
          ELSE attendance_records.status
        END,
        late_minutes = GREATEST(attendance_records.late_minutes, EXCLUDED.late_minutes),
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
      `,
      [
        options.employeeId,
        employee.location_id,
        attendanceDate,
        eventTime,
        status,
        lateMinutes,
      ]
    );

    await client.query("COMMIT");
    const config = await getAttendanceEngineConfig();
    await syncSummaryForDay(options.employeeId, attendanceDate, config);
    publishRealtimeEvent("attendance.check_in", {
      employeeId: options.employeeId,
      eventTime: eventTime.toISOString(),
      lateMinutes,
    });
    if (lateMinutes > 0) {
      await createNotification({
        role: "MANAGER",
        title: "Late arrival detected",
        message: `Employee ${options.employeeId} checked in ${lateMinutes} minute(s) late.`,
        type: "ATTENDANCE",
        priority: "HIGH",
        entityType: "attendance_record",
        entityId: record.rows[0].id,
      });
    }
    return getAttendanceRecordById(record.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkOut(options: AttendanceEventOptions) {
  const eventTime = options.eventTime
    ? new Date(options.eventTime)
    : new Date();
  const attendanceDate = localDateOnly(eventTime);
  const employee = await getEmployeeLocation(options.employeeId);

  if (!employee) return null;

  const existing = await pool.query(
    `
    SELECT id, check_in
    FROM attendance_records
    WHERE employee_id = $1 AND attendance_date = $2
    `,
    [options.employeeId, attendanceDate]
  );

  const checkInTime = existing.rows[0]?.check_in
    ? new Date(existing.rows[0].check_in)
    : null;
  const workingHours = checkInTime
    ? Number(
        (
          minutesBetween(checkInTime, eventTime) / 60
        ).toFixed(2)
      )
    : 0;
  const overtimeHours = Math.max(
    0,
    Number((workingHours - STANDARD_WORK_HOURS).toFixed(2))
  );
  const earlyExitMinutes =
    eventTime < shiftTime(eventTime, SHIFT_END_HOUR)
      ? minutesBetween(
          eventTime,
          shiftTime(eventTime, SHIFT_END_HOUR)
        )
      : 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO attendance_logs (
        employee_id,
        location_id,
        event_type,
        event_time,
        source,
        camera_id
      )
      VALUES ($1, $2, 'CHECK_OUT', $3, $4, $5)
      `,
      [
        options.employeeId,
        employee.location_id,
        eventTime,
        options.source || "MANUAL",
        options.cameraId || null,
      ]
    );

    const record = await client.query(
      `
      INSERT INTO attendance_records (
        employee_id,
        location_id,
        attendance_date,
        check_out,
        working_hours,
        overtime_hours,
        status,
        early_exit_minutes,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PRESENT', $7, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id, attendance_date)
      DO UPDATE SET
        check_out = EXCLUDED.check_out,
        working_hours = EXCLUDED.working_hours,
        overtime_hours = EXCLUDED.overtime_hours,
        early_exit_minutes = EXCLUDED.early_exit_minutes,
        status = CASE
          WHEN attendance_records.late_minutes > 0 THEN 'LATE'
          WHEN EXCLUDED.early_exit_minutes > 0 THEN 'EARLY_EXIT'
          WHEN EXCLUDED.overtime_hours > 0 THEN 'OVERTIME'
          ELSE 'PRESENT'
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
      `,
      [
        options.employeeId,
        employee.location_id,
        attendanceDate,
        eventTime,
        workingHours,
        overtimeHours,
        earlyExitMinutes,
      ]
    );

    await client.query("COMMIT");
    const config = await getAttendanceEngineConfig();
    await syncSummaryForDay(options.employeeId, attendanceDate, config);
    publishRealtimeEvent("attendance.check_out", {
      employeeId: options.employeeId,
      eventTime: eventTime.toISOString(),
      workingHours,
      overtimeHours,
    });
    return getAttendanceRecordById(record.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAttendanceRecordById(id: number) {
  const result = await pool.query(
    `
    ${RECORD_SELECT}
    WHERE ar.id = $1
    `,
    [id]
  );

  return result.rows[0] ? mapRecord(result.rows[0]) : null;
}

export async function deleteAttendanceRecord(
  id: number,
  scope: Scope = {}
) {
  const record = await getAttendanceRecordById(id);
  if (!record) {
    return { deleted: false, reason: "NOT_FOUND" as const };
  }

  if (scope.employeeId && record.employee_id !== scope.employeeId) {
    return { deleted: false, reason: "FORBIDDEN" as const };
  }

  if (scope.managerLocationId && record.location_id !== scope.managerLocationId) {
    return { deleted: false, reason: "FORBIDDEN" as const };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM employee_presence_logs
      WHERE employee_id = $1
        AND event_time::date = $2::date
      `,
      [record.employee_id, record.attendance_date]
    );

    await client.query(
      `
      DELETE FROM employee_presence_state
      WHERE employee_id = $1
        AND attendance_date = $2::date
      `,
      [record.employee_id, record.attendance_date]
    );

    await client.query(
      `
      DELETE FROM attendance_logs
      WHERE employee_id = $1
        AND event_time::date = $2::date
      `,
      [record.employee_id, record.attendance_date]
    );

    await client.query(
      `
      DELETE FROM attendance_summary
      WHERE employee_id = $1
        AND attendance_date = $2::date
      `,
      [record.employee_id, record.attendance_date]
    );

    await client.query(`DELETE FROM attendance_records WHERE id = $1`, [id]);

    await client.query("COMMIT");
    publishRealtimeEvent("attendance.deleted", { id, record });
    return { deleted: true, record };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAttendanceLog(id: number, scope: Scope = {}) {
  const result = await pool.query(
    `
    SELECT al.id, al.employee_id, al.location_id
    FROM attendance_logs al
    WHERE al.id = $1
    `,
    [id]
  );

  const row = result.rows[0];
  if (!row) {
    return { deleted: false, reason: "NOT_FOUND" as const };
  }

  if (scope.employeeId && row.employee_id !== scope.employeeId) {
    return { deleted: false, reason: "FORBIDDEN" as const };
  }

  if (scope.managerLocationId && row.location_id !== scope.managerLocationId) {
    return { deleted: false, reason: "FORBIDDEN" as const };
  }

  await pool.query(`DELETE FROM attendance_logs WHERE id = $1`, [id]);
  publishRealtimeEvent("attendance.log_deleted", { id, log: row });
  return { deleted: true, log: row };
}
