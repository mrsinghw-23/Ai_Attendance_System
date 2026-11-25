import pool from "@/lib/db";
import { ReportResult, ReportType } from "@/types/phase6";
import { UserRole } from "@/types/roles";
import { formatDurationMinutes } from "@/utils/duration-format";
import {
  formatDateTimeIST,
  toDateOnlyInTimezone,
} from "@/utils/timezone";

interface ReportScope {
  role: string;
  locationId?: number | null;
  employeeId?: number | null;
  from?: string | null;
  to?: string | null;
  fromTime?: string | null;
  toTime?: string | null;
}

function appendDateRange(
  scope: ReportScope,
  column: string,
  conditions: string[],
  values: unknown[]
) {
  if (scope.from) {
    values.push(scope.from);
    conditions.push(`${column} >= $${values.length}::date`);
  }
  if (scope.to) {
    values.push(scope.to);
    conditions.push(`${column} <= $${values.length}::date`);
  }
}

function appendTimestampRange(
  scope: ReportScope,
  column: string,
  conditions: string[],
  values: unknown[]
) {
  if (scope.from) {
    const ts = scope.fromTime
      ? `${scope.from} ${scope.fromTime}:00`
      : `${scope.from} 00:00:00`;
    values.push(ts);
    conditions.push(`${column} >= $${values.length}::timestamp`);
  }
  if (scope.to) {
    const ts = scope.toTime
      ? `${scope.to} ${scope.toTime}:59`
      : `${scope.to} 23:59:59`;
    values.push(ts);
    conditions.push(`${column} <= $${values.length}::timestamp`);
  }
}

function buildWhere(
  conditions: string[],
  values: unknown[]
) {
  return conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
}

function summaryScope(scope: ReportScope, alias = "asum") {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (scope.role === UserRole.MANAGER && scope.locationId) {
    values.push(scope.locationId);
    conditions.push(`${alias}.location_id = $${values.length}`);
  }

  if (scope.role === UserRole.EMPLOYEE && scope.employeeId) {
    values.push(scope.employeeId);
    conditions.push(`${alias}.employee_id = $${values.length}`);
  }

  appendDateRange(scope, `${alias}.attendance_date`, conditions, values);

  return {
    clause: buildWhere(conditions, values),
    values,
    conditions,
  };
}

function scopedWhere(scope: ReportScope, alias = "e") {
  if (scope.role === UserRole.MANAGER && scope.locationId) {
    return {
      clause: `WHERE ${alias}.location_id = $1`,
      values: [scope.locationId],
    };
  }

  if (scope.role === UserRole.EMPLOYEE && scope.employeeId) {
    return {
      clause: `WHERE ${alias}.id = $1`,
      values: [scope.employeeId],
    };
  }

  return { clause: "", values: [] as unknown[] };
}

function liveWorkingHoursSql(
  checkInCol: string,
  checkOutCol: string,
  storedHoursCol: string
) {
  return `
    ROUND(
      CASE
        WHEN ${checkInCol} IS NOT NULL AND ${checkOutCol} IS NOT NULL THEN
          GREATEST(
            COALESCE(${storedHoursCol}, 0)::numeric,
            EXTRACT(EPOCH FROM (${checkOutCol} - ${checkInCol})) / 3600.0
          )
        WHEN ${checkInCol} IS NOT NULL THEN
          GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ${checkInCol})) / 3600.0)
        ELSE COALESCE(${storedHoursCol}, 0)::numeric
      END,
      2
    )::float
  `;
}

function liveOvertimeSql(workingHoursExpr: string, standardHours = 9) {
  return `GREATEST(0, ROUND((${workingHoursExpr}) - ${standardHours}, 2))::float`;
}

function formatReportValue(column: string, value: unknown): unknown {
  if (value == null || value === "") return "";

  if (
    column === "attendance_date" ||
    column === "date" ||
    column.endsWith("_date")
  ) {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return toDateOnlyInTimezone(text);
  }

  if (
    column === "check_in" ||
    column === "check_out" ||
    column === "event_time" ||
    column.endsWith("_at") ||
    column.endsWith("_time")
  ) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return formatDateTimeIST(date);
  }

  if (column === "working_hours" || column === "overtime_hours") {
    const hours = Number(value);
    if (!Number.isFinite(hours)) return String(value);
    return hours.toFixed(2);
  }

  return value;
}

function dedupeReportRows(report: ReportResult): ReportResult {
  const singleRowReports = new Set([
    "Attendance Report",
    "Daily Attendance Report",
    "Working Hours Report",
    "Late Arrival Report",
    "Half Day Report",
  ]);

  if (!singleRowReports.has(report.title)) {
    return report;
  }

  const seen = new Set<string>();
  const rows = report.rows.filter((row) => {
    const key = [
      String(row.employee_code ?? row.employee ?? ""),
      String(row.attendance_date ?? row.date ?? ""),
    ].join("|");
    if (!key.replace(/\|/g, "")) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return rows.length === report.rows.length ? report : { ...report, rows };
}

function withFormattedPresentation(report: ReportResult): ReportResult {
  const rows = report.rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(row)) {
      next[column] = formatReportValue(column, value);
    }
    return next;
  });

  return dedupeReportRows({ ...report, rows });
}

function withFormattedLate(report: ReportResult): ReportResult {
  if (!report.columns.includes("late_minutes")) return report;

  return {
    ...report,
    columns: report.columns.map((col) =>
      col === "late_minutes" ? "late" : col
    ),
    rows: report.rows.map((row) => {
      const next = { ...row } as Record<string, unknown>;
      const minutes = Number(next.late_minutes ?? 0);
      delete next.late_minutes;
      next.late = formatDurationMinutes(minutes);
      return next;
    }),
  };
}

export async function getReport(
  type: ReportType,
  scope: ReportScope
): Promise<ReportResult> {
  const report = await buildReport(type, scope);
  return withFormattedPresentation(withFormattedLate(report));
}

async function buildReport(
  type: ReportType,
  scope: ReportScope
): Promise<ReportResult> {
  switch (type) {
    case "attendance":
      return getAttendanceReport(scope);
    case "employees":
      return getEmployeeReport(scope);
    case "locations":
      return getLocationReport(scope);
    case "cameras":
      return getCameraReport(scope);
    case "audit":
      return getAuditReport(scope);
    case "daily_attendance":
      return getDailyAttendanceReport(scope);
    case "employee_attendance":
      return getEmployeeAttendanceReport(scope);
    case "late_arrival":
      return getLateArrivalReport(scope);
    case "half_day":
      return getHalfDayReport(scope);
    case "absent":
      return getAbsentReport(scope);
    case "working_hours":
      return getWorkingHoursReport(scope);
    case "movement":
      return getMovementReport(scope);
    case "camera_activity":
      return getCameraActivityReport(scope);
    case "location_attendance":
      return getLocationAttendanceReport(scope);
    case "camera_health":
      return getCameraHealthReport(scope);
    case "camera_uptime":
      return getCameraUptimeReport(scope);
    case "camera_downtime":
      return getCameraDowntimeReport(scope);
    case "camera_attendance":
      return getCameraAttendanceReport(scope);
    case "motion_detection":
      return getMotionDetectionReport(scope);
    case "location_camera":
      return getLocationCameraReport(scope);
    case "face_registration":
      return getFaceRegistrationReport(scope);
    case "missing_face_profiles":
      return getMissingFaceProfilesReport(scope);
    case "registration_progress":
      return getRegistrationProgressReport(scope);
    case "ai_face_recognition":
      return getAIFaceRecognitionReport(scope);
    case "ai_gate_attendance":
      return getAIGateAttendanceReport(scope);
    case "unknown_faces":
      return getUnknownFacesReport(scope);
  }
}

async function getAttendanceReport(scope: ReportScope): Promise<ReportResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (scope.role === UserRole.MANAGER && scope.locationId) {
    values.push(scope.locationId);
    conditions.push(`ar.location_id = $${values.length}`);
  }
  if (scope.role === UserRole.EMPLOYEE && scope.employeeId) {
    values.push(scope.employeeId);
    conditions.push(`ar.employee_id = $${values.length}`);
  }
  appendDateRange(scope, "ar.attendance_date", conditions, values);

  const workingHoursExpr = liveWorkingHoursSql(
    "ar.check_in",
    "ar.check_out",
    "ar.working_hours"
  );

  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT DISTINCT ON (ar.employee_id, ar.attendance_date)
        ar.id AS record_id,
        e.employee_code,
        TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
        l.location_name,
        ar.attendance_date,
        ar.check_in,
        ar.check_out,
        ${workingHoursExpr} AS working_hours,
        ${liveOvertimeSql(workingHoursExpr)} AS overtime_hours,
        ar.status,
        ar.late_minutes
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN locations l ON l.id = ar.location_id
      ${buildWhere(conditions, values)}
      ORDER BY ar.employee_id, ar.attendance_date, ar.updated_at DESC NULLS LAST, ar.id DESC
    ) deduped
    ORDER BY attendance_date DESC, check_in DESC NULLS LAST
    LIMIT 1000
    `,
    values
  );

  return {
    title: "Attendance Report",
    columns: [
      "record_id",
      "employee_code",
      "employee",
      "location_name",
      "attendance_date",
      "check_in",
      "check_out",
      "working_hours",
      "overtime_hours",
      "status",
      "late_minutes",
    ],
    rows: result.rows,
  };
}

async function getEmployeeReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = scopedWhere(scope, "e");
  const result = await pool.query(
    `
    SELECT
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
      e.department,
      e.designation,
      l.location_name,
      e.status,
      e.face_registration_status
    FROM employees e
    LEFT JOIN locations l ON l.id = e.location_id
    ${scoped.clause}
    ORDER BY e.employee_code
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Employee Report",
    columns: [
      "employee_code",
      "employee",
      "department",
      "designation",
      "location_name",
      "status",
      "face_registration_status",
    ],
    rows: result.rows,
  };
}

async function getLocationReport(scope: ReportScope): Promise<ReportResult> {
  const scoped =
    scope.role === UserRole.MANAGER && scope.locationId
      ? { clause: "WHERE l.id = $1", values: [scope.locationId] }
      : { clause: "", values: [] as unknown[] };

  const result = await pool.query(
    `
    SELECT
      l.location_name,
      l.city,
      l.state,
      COUNT(DISTINCT e.id)::int AS employees,
      COUNT(DISTINCT c.id)::int AS cameras
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id
    LEFT JOIN cameras c ON c.location_id = l.id
    ${scoped.clause}
    GROUP BY l.id
    ORDER BY l.location_name
    `,
    scoped.values
  );

  return {
    title: "Location Report",
    columns: ["location_name", "city", "state", "employees", "cameras"],
    rows: result.rows,
  };
}

async function getCameraReport(scope: ReportScope): Promise<ReportResult> {
  const scoped =
    scope.role === UserRole.MANAGER && scope.locationId
      ? { clause: "WHERE c.location_id = $1", values: [scope.locationId] }
      : { clause: "", values: [] as unknown[] };

  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      c.camera_code,
      c.camera_type,
      c.brand,
      c.model,
      c.camera_ip,
      c.port,
      l.location_name,
      z.zone_name,
      c.floor,
      c.entry_exit_type,
      c.status,
      c.health_status,
      c.recording_status,
      c.last_seen,
      c.installation_date,
      c.warranty_date
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN camera_zones z ON z.id = c.zone_id
    ${scoped.clause}
    ORDER BY c.camera_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Camera Master Report",
    columns: [
      "camera_name",
      "camera_code",
      "camera_type",
      "brand",
      "model",
      "camera_ip",
      "port",
      "location_name",
      "zone_name",
      "floor",
      "entry_exit_type",
      "status",
      "health_status",
      "recording_status",
      "last_seen",
      "installation_date",
      "warranty_date",
    ],
    rows: result.rows,
  };
}

async function getAuditReport(scope: ReportScope): Promise<ReportResult> {
  if (scope.role !== UserRole.SUPER_ADMIN) {
    return {
      title: "Audit Report",
      columns: ["message"],
      rows: [{ message: "Forbidden" }],
    };
  }

  const result = await pool.query(
    `
    SELECT username, action, entity_type, entity_id, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 1000
    `
  );

  return {
    title: "Audit Report",
    columns: ["username", "action", "entity_type", "entity_id", "created_at"],
    rows: result.rows,
  };
}

async function getDailyAttendanceReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = summaryScope(scope, "asum");
  const workingHoursExpr = liveWorkingHoursSql(
    "asum.check_in",
    "asum.check_out",
    "asum.working_hours"
  );

  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT DISTINCT ON (asum.employee_id, asum.attendance_date)
        asum.attendance_date,
        e.employee_code,
        TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
        l.location_name,
        asum.check_in,
        asum.check_out,
        ${workingHoursExpr} AS working_hours,
        asum.attendance_status,
        asum.late_minutes
      FROM attendance_summary asum
      JOIN employees e ON e.id = asum.employee_id
      LEFT JOIN locations l ON l.id = asum.location_id
      ${scoped.clause}
      ORDER BY asum.employee_id, asum.attendance_date, asum.updated_at DESC NULLS LAST
    ) deduped
    ORDER BY attendance_date DESC, check_in DESC NULLS LAST
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Daily Attendance Report",
    columns: [
      "attendance_date",
      "employee_code",
      "employee",
      "location_name",
      "check_in",
      "check_out",
      "working_hours",
      "attendance_status",
      "late_minutes",
    ],
    rows: result.rows,
  };
}

async function getEmployeeAttendanceReport(scope: ReportScope): Promise<ReportResult> {
  return getDailyAttendanceReport(scope);
}

async function getLateArrivalReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = summaryScope(scope, "asum");
  const conditions = [...scoped.conditions, "asum.late_minutes > 0"];
  const clause = buildWhere(conditions, scoped.values);

  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT DISTINCT ON (asum.employee_id, asum.attendance_date)
        asum.attendance_date,
        e.employee_code,
        TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
        asum.check_in,
        asum.late_minutes,
        asum.attendance_status
      FROM attendance_summary asum
      JOIN employees e ON e.id = asum.employee_id
      ${clause}
      ORDER BY asum.employee_id, asum.attendance_date, asum.updated_at DESC NULLS LAST
    ) deduped
    ORDER BY late_minutes DESC, attendance_date DESC
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Late Arrival Report",
    columns: [
      "attendance_date",
      "employee_code",
      "employee",
      "check_in",
      "late_minutes",
      "attendance_status",
    ],
    rows: result.rows,
  };
}

async function getHalfDayReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = summaryScope(scope, "asum");
  const conditions = [...scoped.conditions, "asum.attendance_status = 'HALF_DAY'"];
  const clause = buildWhere(conditions, scoped.values);

  const result = await pool.query(
    `
    SELECT
      asum.attendance_date,
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
      asum.working_hours,
      asum.check_in,
      asum.check_out
    FROM attendance_summary asum
    JOIN employees e ON e.id = asum.employee_id
    ${clause}
    ORDER BY asum.attendance_date DESC
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Half Day Report",
    columns: [
      "attendance_date",
      "employee_code",
      "employee",
      "working_hours",
      "check_in",
      "check_out",
    ],
    rows: result.rows,
  };
}

async function getAbsentReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = summaryScope(scope, "asum");
  const conditions = [...scoped.conditions, "asum.attendance_status = 'ABSENT'"];
  const clause = buildWhere(conditions, scoped.values);

  const result = await pool.query(
    `
    SELECT
      asum.attendance_date,
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
      l.location_name
    FROM attendance_summary asum
    JOIN employees e ON e.id = asum.employee_id
    LEFT JOIN locations l ON l.id = asum.location_id
    ${clause}
    ORDER BY asum.attendance_date DESC
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Absent Report",
    columns: ["attendance_date", "employee_code", "employee", "location_name"],
    rows: result.rows,
  };
}

async function getWorkingHoursReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = summaryScope(scope, "asum");
  const workingHoursExpr = liveWorkingHoursSql(
    "asum.check_in",
    "asum.check_out",
    "asum.working_hours"
  );

  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT DISTINCT ON (asum.employee_id, asum.attendance_date)
        asum.attendance_date,
        e.employee_code,
        TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
        ${workingHoursExpr} AS working_hours,
        ROUND((${workingHoursExpr}) * 60)::int AS total_inside_minutes,
        asum.total_outside_minutes,
        GREATEST(0, ROUND((${workingHoursExpr} - 9) * 60))::int AS overtime_minutes
      FROM attendance_summary asum
      JOIN employees e ON e.id = asum.employee_id
      ${scoped.clause}
      ORDER BY asum.employee_id, asum.attendance_date, asum.updated_at DESC NULLS LAST
    ) deduped
    ORDER BY working_hours DESC, attendance_date DESC
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Working Hours Report",
    columns: [
      "attendance_date",
      "employee_code",
      "employee",
      "working_hours",
      "total_inside_minutes",
      "total_outside_minutes",
      "overtime_minutes",
    ],
    rows: result.rows,
  };
}

async function getMovementReport(scope: ReportScope): Promise<ReportResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (scope.role === UserRole.MANAGER && scope.locationId) {
    conditions.push(`epl.location_id = $${idx++}`);
    values.push(scope.locationId);
  }
  if (scope.role === UserRole.EMPLOYEE && scope.employeeId) {
    conditions.push(`epl.employee_id = $${idx++}`);
    values.push(scope.employeeId);
  }

  appendTimestampRange(scope, "epl.event_time", conditions, values);

  const where = buildWhere(conditions, values);

  const result = await pool.query(
    `
    SELECT
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee,
      epl.event_type,
      epl.event_time,
      c.camera_name,
      l.location_name,
      epl.source
    FROM employee_presence_logs epl
    JOIN employees e ON e.id = epl.employee_id
    LEFT JOIN cameras c ON c.id = epl.camera_id
    LEFT JOIN locations l ON l.id = epl.location_id
    ${where}
    ORDER BY epl.event_time DESC
    LIMIT 1000
    `,
    values
  );

  return {
    title: "Movement Report",
    columns: [
      "employee_code",
      "employee",
      "event_type",
      "event_time",
      "camera_name",
      "location_name",
      "source",
    ],
    rows: result.rows,
  };
}

async function getCameraActivityReport(scope: ReportScope): Promise<ReportResult> {
  const scoped =
    scope.role === UserRole.MANAGER && scope.locationId
      ? { clause: "WHERE c.location_id = $1", values: [scope.locationId] }
      : { clause: "", values: [] as unknown[] };

  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      l.location_name,
      c.health_status,
      COUNT(fe.id)::int AS detections,
      COUNT(DISTINCT fe.employee_id)::int AS unique_employees,
      MAX(fe.event_time) AS last_detection
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN face_events fe ON fe.camera_id = c.id
    ${scoped.clause}
    GROUP BY c.id, c.camera_name, l.location_name, c.health_status
    ORDER BY detections DESC
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Camera Activity Report",
    columns: [
      "camera_name",
      "location_name",
      "health_status",
      "detections",
      "unique_employees",
      "last_detection",
    ],
    rows: result.rows,
  };
}

async function getLocationAttendanceReport(scope: ReportScope): Promise<ReportResult> {
  const scoped =
    scope.role === UserRole.MANAGER && scope.locationId
      ? { clause: "WHERE l.id = $1", values: [scope.locationId] }
      : { clause: "", values: [] as unknown[] };

  const result = await pool.query(
    `
    SELECT
      l.location_name,
      COUNT(DISTINCT e.id)::int AS employees,
      COUNT(DISTINCT c.id)::int AS cameras,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
      )::int AS present,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.attendance_status = 'ABSENT'
      )::int AS absent,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.late_minutes > 0
      )::int AS late
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id
    LEFT JOIN cameras c ON c.location_id = l.id
    LEFT JOIN attendance_summary asum ON asum.location_id = l.id
    ${scoped.clause}
    GROUP BY l.id, l.location_name
    ORDER BY l.location_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Location Attendance Report",
    columns: [
      "location_name",
      "employees",
      "cameras",
      "present",
      "absent",
      "late",
    ],
    rows: result.rows,
  };
}

function cameraScopeClause(scope: ReportScope, alias = "c") {
  if (scope.role === UserRole.MANAGER && scope.locationId) {
    return {
      clause: `WHERE ${alias}.location_id = $1`,
      values: [scope.locationId],
    };
  }
  return { clause: "", values: [] as unknown[] };
}

async function getCameraHealthReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = cameraScopeClause(scope, "c");
  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      l.location_name,
      chl.health_status,
      chl.camera_reachable,
      chl.rtsp_reachable,
      chl.stream_available,
      chl.latency_ms,
      chl.message,
      chl.checked_at
    FROM camera_health_logs chl
    JOIN cameras c ON c.id = chl.camera_id
    LEFT JOIN locations l ON l.id = c.location_id
    ${scoped.clause}
    ORDER BY chl.checked_at DESC
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Camera Health Report",
    columns: [
      "camera_name",
      "location_name",
      "health_status",
      "camera_reachable",
      "rtsp_reachable",
      "stream_available",
      "latency_ms",
      "message",
      "checked_at",
    ],
    rows: result.rows,
  };
}

async function getCameraUptimeReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = cameraScopeClause(scope, "c");
  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      l.location_name,
      COUNT(chl.id) FILTER (WHERE chl.health_status = 'ONLINE')::int AS online_checks,
      COUNT(chl.id)::int AS total_checks,
      ROUND(
        100.0 * COUNT(chl.id) FILTER (WHERE chl.health_status = 'ONLINE')
        / NULLIF(COUNT(chl.id), 0),
        2
      ) AS uptime_percent
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN camera_health_logs chl ON chl.camera_id = c.id
      AND chl.checked_at >= CURRENT_DATE - INTERVAL '7 days'
    ${scoped.clause}
    GROUP BY c.id, c.camera_name, l.location_name
    ORDER BY uptime_percent DESC NULLS LAST, c.camera_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Camera Uptime Report (7 days)",
    columns: [
      "camera_name",
      "location_name",
      "online_checks",
      "total_checks",
      "uptime_percent",
    ],
    rows: result.rows,
  };
}

async function getCameraDowntimeReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = cameraScopeClause(scope, "c");
  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      l.location_name,
      COUNT(chl.id) FILTER (WHERE chl.health_status = 'OFFLINE')::int AS offline_checks,
      COUNT(chl.id) FILTER (WHERE chl.health_status = 'WARNING')::int AS warning_checks,
      COUNT(chl.id)::int AS total_checks,
      MAX(chl.checked_at) FILTER (WHERE chl.health_status = 'OFFLINE') AS last_offline_at
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN camera_health_logs chl ON chl.camera_id = c.id
      AND chl.checked_at >= CURRENT_DATE - INTERVAL '7 days'
    ${scoped.clause}
    GROUP BY c.id, c.camera_name, l.location_name
    ORDER BY offline_checks DESC, c.camera_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Camera Downtime Report (7 days)",
    columns: [
      "camera_name",
      "location_name",
      "offline_checks",
      "warning_checks",
      "total_checks",
      "last_offline_at",
    ],
    rows: result.rows,
  };
}

async function getCameraAttendanceReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = cameraScopeClause(scope, "c");
  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      l.location_name,
      COUNT(fe.id)::int AS total_detections,
      COUNT(DISTINCT fe.employee_id)::int AS unique_employees,
      MAX(fe.event_time) AS last_detection
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN face_events fe ON fe.camera_id = c.id
    ${scoped.clause}
    GROUP BY c.id, c.camera_name, l.location_name
    ORDER BY total_detections DESC, c.camera_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Camera Attendance Report",
    columns: [
      "camera_name",
      "location_name",
      "total_detections",
      "unique_employees",
      "last_detection",
    ],
    rows: result.rows,
  };
}

async function getMotionDetectionReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = cameraScopeClause(scope, "c");
  const result = await pool.query(
    `
    SELECT
      c.camera_name,
      l.location_name,
      c.motion_enabled,
      c.motion_sensitivity,
      c.last_motion_detected,
      COUNT(ce.id)::int AS motion_events
    FROM cameras c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN camera_events ce ON ce.camera_id = c.id
      AND ce.event_type = 'MOTION_DETECTED'
    ${scoped.clause}
    GROUP BY c.id, c.camera_name, l.location_name, c.motion_enabled, c.motion_sensitivity, c.last_motion_detected
    ORDER BY motion_events DESC, c.camera_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Motion Detection Report",
    columns: [
      "camera_name",
      "location_name",
      "motion_enabled",
      "motion_sensitivity",
      "last_motion_detected",
      "motion_events",
    ],
    rows: result.rows,
  };
}

async function getLocationCameraReport(scope: ReportScope): Promise<ReportResult> {
  const scoped =
    scope.role === UserRole.MANAGER && scope.locationId
      ? { clause: "WHERE l.id = $1", values: [scope.locationId] }
      : { clause: "", values: [] as unknown[] };

  const result = await pool.query(
    `
    SELECT
      l.location_name,
      z.zone_name,
      COUNT(c.id)::int AS cameras,
      COUNT(c.id) FILTER (WHERE c.health_status = 'ONLINE')::int AS online,
      COUNT(c.id) FILTER (WHERE c.health_status = 'OFFLINE')::int AS offline,
      COUNT(c.id) FILTER (WHERE c.health_status = 'WARNING')::int AS warning
    FROM locations l
    LEFT JOIN cameras c ON c.location_id = l.id
    LEFT JOIN camera_zones z ON z.id = c.zone_id
    ${scoped.clause}
    GROUP BY l.location_name, z.zone_name
    ORDER BY l.location_name, z.zone_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Location-wise Camera Report",
    columns: [
      "location_name",
      "zone_name",
      "cameras",
      "online",
      "offline",
      "warning",
    ],
    rows: result.rows,
  };
}

function employeeReportScope(scope: ReportScope, alias = "e") {
  if (scope.role === UserRole.MANAGER && scope.locationId) {
    return {
      clause: `WHERE ${alias}.location_id = $1`,
      values: [scope.locationId],
    };
  }
  return { clause: "", values: [] as unknown[] };
}

async function getFaceRegistrationReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = employeeReportScope(scope, "e");
  const result = await pool.query(
    `
    SELECT
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee_name,
      l.location_name,
      COALESCE(efp.profile_status, 'NOT_REGISTERED') AS profile_status,
      COALESCE(efp.image_count, 0)::int AS image_count,
      efp.registration_date,
      efp.updated_at AS last_updated
    FROM employees e
    LEFT JOIN locations l ON l.id = e.location_id
    LEFT JOIN employee_face_profiles efp ON efp.employee_id = e.id
    ${scoped.clause}
    ORDER BY e.employee_code
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Face Registration Report",
    columns: [
      "employee_code",
      "employee_name",
      "location_name",
      "profile_status",
      "image_count",
      "registration_date",
      "last_updated",
    ],
    rows: result.rows,
  };
}

async function getMissingFaceProfilesReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = employeeReportScope(scope, "e");
  const extra = scoped.clause
    ? `${scoped.clause} AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE' AND COALESCE(efp.profile_status, 'NOT_REGISTERED') != 'FULLY_REGISTERED'`
    : `WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE' AND COALESCE(efp.profile_status, 'NOT_REGISTERED') != 'FULLY_REGISTERED'`;

  const result = await pool.query(
    `
    SELECT
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee_name,
      l.location_name,
      COALESCE(efp.profile_status, 'NOT_REGISTERED') AS profile_status,
      COALESCE(efp.image_count, 0)::int AS image_count
    FROM employees e
    LEFT JOIN locations l ON l.id = e.location_id
    LEFT JOIN employee_face_profiles efp ON efp.employee_id = e.id
    ${extra}
    ORDER BY e.employee_code
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Missing Face Profiles Report",
    columns: [
      "employee_code",
      "employee_name",
      "location_name",
      "profile_status",
      "image_count",
    ],
    rows: result.rows,
  };
}

async function getRegistrationProgressReport(scope: ReportScope): Promise<ReportResult> {
  const scoped = employeeReportScope(scope, "l");
  const result = await pool.query(
    `
    SELECT
      l.location_name,
      COUNT(e.id)::int AS total_employees,
      COUNT(e.id) FILTER (
        WHERE COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'FULLY_REGISTERED'
      )::int AS fully_registered,
      COUNT(e.id) FILTER (
        WHERE COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'PARTIALLY_REGISTERED'
      )::int AS partially_registered,
      COUNT(e.id) FILTER (
        WHERE COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'NOT_REGISTERED' OR efp.id IS NULL
      )::int AS not_registered,
      ROUND(
        100.0 * COUNT(e.id) FILTER (
          WHERE COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'FULLY_REGISTERED'
        ) / NULLIF(COUNT(e.id), 0),
        2
      ) AS registration_percentage
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
    LEFT JOIN employee_face_profiles efp ON efp.employee_id = e.id
    ${scoped.clause}
    GROUP BY l.id, l.location_name
    ORDER BY l.location_name
    LIMIT 1000
    `,
    scoped.values
  );

  return {
    title: "Registration Progress Report",
    columns: [
      "location_name",
      "total_employees",
      "fully_registered",
      "partially_registered",
      "not_registered",
      "registration_percentage",
    ],
    rows: result.rows,
  };
}

async function getAIFaceRecognitionReport(
  scope: ReportScope
): Promise<ReportResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (scope.role === UserRole.MANAGER && scope.locationId) {
    values.push(scope.locationId);
    conditions.push(`fe.location_id = $${values.length}`);
  }
  if (scope.role === UserRole.EMPLOYEE && scope.employeeId) {
    values.push(scope.employeeId);
    conditions.push(`fe.employee_id = $${values.length}`);
  }
  appendTimestampRange(scope, "fe.event_time", conditions, values);

  const result = await pool.query(
    `
    SELECT
      fe.event_time,
      fe.event_type,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      e.employee_code,
      c.camera_name,
      l.location_name,
      fe.metadata->>'branch_name' AS branch_name,
      fe.metadata->>'entrance' AS entrance,
      fe.confidence,
      fe.processed,
      fe.metadata->>'source' AS source
    FROM face_events fe
    LEFT JOIN employees e ON e.id = fe.employee_id
    LEFT JOIN cameras c ON c.id = fe.camera_id
    LEFT JOIN locations l ON l.id = fe.location_id
    ${buildWhere(conditions, values)}
    ORDER BY fe.event_time DESC
    LIMIT 1000
    `,
    values
  );

  return {
    title: "AI Face Recognition Report",
    columns: [
      "event_time",
      "event_type",
      "employee_code",
      "employee_name",
      "camera_name",
      "location_name",
      "branch_name",
      "entrance",
      "confidence",
      "processed",
      "source",
    ],
    rows: result.rows,
  };
}

async function getAIGateAttendanceReport(
  scope: ReportScope
): Promise<ReportResult> {
  const conditions: string[] = ["al.source = 'AI_FACE_RECOGNITION'"];
  const values: unknown[] = [];

  if (scope.role === UserRole.MANAGER && scope.locationId) {
    values.push(scope.locationId);
    conditions.push(`al.location_id = $${values.length}`);
  }
  if (scope.role === UserRole.EMPLOYEE && scope.employeeId) {
    values.push(scope.employeeId);
    conditions.push(`al.employee_id = $${values.length}`);
  }
  appendTimestampRange(scope, "al.event_time", conditions, values);

  const result = await pool.query(
    `
    SELECT
      al.event_time,
      al.event_type AS action,
      e.employee_code,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      c.camera_name,
      l.location_name,
      fe.metadata->>'branch_name' AS branch_name,
      fe.metadata->>'entrance' AS entrance,
      ar.status AS attendance_status,
      ar.late_minutes,
      ar.check_in,
      ar.check_out,
      fe.confidence,
      fe.metadata->>'source' AS scan_source
    FROM attendance_logs al
    JOIN employees e ON e.id = al.employee_id
    LEFT JOIN cameras c ON c.id = al.camera_id
    LEFT JOIN locations l ON l.id = al.location_id
    LEFT JOIN attendance_records ar
      ON ar.employee_id = al.employee_id
      AND ar.attendance_date = al.event_time::date
    LEFT JOIN LATERAL (
      SELECT confidence, metadata
      FROM face_events fe_inner
      WHERE fe_inner.attendance_log_id = al.id
      ORDER BY fe_inner.event_time DESC, fe_inner.id DESC
      LIMIT 1
    ) fe ON true
    ${buildWhere(conditions, values)}
    ORDER BY al.event_time DESC
    LIMIT 1000
    `,
    values
  );

  return {
    title: "AI Gate Attendance Report",
    columns: [
      "event_time",
      "action",
      "employee_code",
      "employee_name",
      "camera_name",
      "location_name",
      "branch_name",
      "entrance",
      "attendance_status",
      "late_minutes",
      "check_in",
      "check_out",
      "confidence",
      "scan_source",
    ],
    rows: result.rows,
  };
}

async function getUnknownFacesReport(scope: ReportScope): Promise<ReportResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (scope.role === UserRole.MANAGER && scope.locationId) {
    values.push(scope.locationId);
    conditions.push(`uf.location_id = $${values.length}`);
  }
  appendTimestampRange(scope, "uf.detected_at", conditions, values);

  const result = await pool.query(
    `
    SELECT
      uf.id,
      uf.detected_at,
      c.camera_name,
      l.location_name,
      uf.confidence,
      uf.image_path
    FROM unknown_faces uf
    LEFT JOIN cameras c ON c.id = uf.camera_id
    LEFT JOIN locations l ON l.id = uf.location_id
    ${buildWhere(conditions, values)}
    ORDER BY uf.detected_at DESC
    LIMIT 1000
    `,
    values
  );

  return {
    title: "Unknown Faces Report",
    columns: [
      "id",
      "detected_at",
      "camera_name",
      "location_name",
      "confidence",
      "image_path",
    ],
    rows: result.rows,
  };
}
