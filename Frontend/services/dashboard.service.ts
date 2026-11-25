import pool from "@/lib/db";
import { getCameraStats, getCameras } from "@/services/camera.service";
import { getFaceRegistrationStats } from "@/services/face-registration.service";
import { scannableEmployeeFilterSql } from "@/services/employee-encoding-cache.service";
import { DashboardOverview } from "@/types/dashboard";
import {
  formatRelativeTimeIST,
  getTodayInTimezone,
  toDateOnlyInTimezone,
} from "@/utils/timezone";

interface DashboardScope {
  managerLocationId?: number | null;
  period?: "day" | "week" | "month" | "custom";
  startDate?: string;
  endDate?: string;
}

export type { DashboardOverview };

function todayDate() {
  return getTodayInTimezone();
}

function resolveTrendRange(scope: DashboardScope) {
  const today = todayDate();
  const period = scope.period || "week";

  if (period === "day") {
    return { startDate: today, endDate: today, label: "Today" };
  }

  if (period === "month") {
    const start = `${today.slice(0, 8)}01`;
    return { startDate: start, endDate: today, label: "This Month" };
  }

  if (period === "custom" && scope.startDate && scope.endDate) {
    return {
      startDate: scope.startDate,
      endDate: scope.endDate,
      label: "Custom Range",
    };
  }

  const end = new Date(`${today}T12:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    startDate: toDateOnlyInTimezone(start),
    endDate: today,
    label: "This Week",
  };
}

export async function getDashboardOverview(
  scope: DashboardScope = {}
): Promise<DashboardOverview> {
  const today = todayDate();
  const trendRange = resolveTrendRange(scope);
  const locationFilter = scope.managerLocationId
    ? "AND e.location_id = $1"
    : "";
  const locationValues = scope.managerLocationId
    ? [scope.managerLocationId]
    : [];

  const employeeCount = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM employees e
    WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
    ${locationFilter}
    `,
    locationValues
  );

  const summaryScope = scope.managerLocationId
    ? "AND asum.location_id = $2"
    : "";
  const summaryValues = scope.managerLocationId
    ? [today, scope.managerLocationId]
    : [today];

  const todaySummary = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
      )::int AS present,
      COUNT(*) FILTER (WHERE asum.late_minutes > 0)::int AS late,
      COUNT(*) FILTER (WHERE asum.attendance_status = 'ABSENT')::int AS absent,
      COUNT(*) FILTER (WHERE asum.attendance_status = 'HALF_DAY')::int AS half_day
    FROM attendance_summary asum
    WHERE asum.attendance_date = $1::date
    ${summaryScope}
    `,
    summaryValues
  );

  const totalEmployees = employeeCount.rows[0]?.total || 0;
  const presentToday = todaySummary.rows[0]?.present || 0;
  const lateToday = todaySummary.rows[0]?.late || 0;
  const absentToday = todaySummary.rows[0]?.absent || 0;
  const halfDayToday = todaySummary.rows[0]?.half_day || 0;

  const cameraStats = await getCameraStats(scope.managerLocationId);
  const allCameras = await getCameras({
      managerLocationId: scope.managerLocationId,
    });

  const cameraList = allCameras;

  const locationsScope = scope.managerLocationId
    ? "WHERE l.id = $2"
    : "";
  const locationsQueryValues = scope.managerLocationId
    ? [today, scope.managerLocationId]
    : [today];

  const locations = await pool.query(
    `
    SELECT
      l.id AS location_id,
      l.location_name,
      COUNT(DISTINCT e.id)::int AS employee_count,
      COUNT(DISTINCT asum.employee_id) FILTER (
        WHERE asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
      )::int AS present_today
    FROM locations l
    LEFT JOIN employees e ON e.location_id = l.id
      AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
    LEFT JOIN attendance_summary asum ON asum.location_id = l.id
      AND asum.attendance_date = $1::date
    ${locationsScope}
    GROUP BY l.id, l.location_name
    ORDER BY l.location_name
    `,
    locationsQueryValues
  );

  const weeklyScope = scope.managerLocationId
    ? "AND asum.location_id = $3"
    : "";
  const weeklyValues = scope.managerLocationId
    ? [trendRange.startDate, trendRange.endDate, scope.managerLocationId]
    : [trendRange.startDate, trendRange.endDate];

  const weekly = await pool.query(
    `
    SELECT
      TO_CHAR(asum.attendance_date, 'Dy') AS day,
      asum.attendance_date::text AS date,
      COUNT(*) FILTER (
        WHERE asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
      )::int AS present,
      COUNT(*) FILTER (WHERE asum.late_minutes > 0)::int AS late
    FROM attendance_summary asum
    WHERE asum.attendance_date >= $1::date
      AND asum.attendance_date <= $2::date
    ${weeklyScope}
    GROUP BY asum.attendance_date
    ORDER BY asum.attendance_date ASC
    `,
    weeklyValues
  );

  const monthScope = scope.managerLocationId
    ? "AND asum.location_id = $1"
    : "";
  const monthValues = scope.managerLocationId
    ? [scope.managerLocationId]
    : [];

  const monthly = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE asum.attendance_status = 'FULL_DAY')::int AS full_day,
      COUNT(*) FILTER (WHERE asum.attendance_status = 'HALF_DAY')::int AS half_day,
      COUNT(*) FILTER (WHERE asum.attendance_status = 'ABSENT')::int AS absent
    FROM attendance_summary asum
    WHERE DATE_TRUNC('month', asum.attendance_date) = DATE_TRUNC('month', CURRENT_DATE)
    ${monthScope}
    `,
    monthValues
  );

  const activityScope = scope.managerLocationId
    ? "AND al.location_id = $1"
    : "";
  const activityValues = scope.managerLocationId
    ? [scope.managerLocationId]
    : [];

  const activity = await pool.query(
    `
    SELECT
      al.event_type,
      al.event_time,
      al.source,
      TRIM(CONCAT(
        COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
        ' ',
        COALESCE(e.last_name, '')
      )) AS employee_name,
      c.camera_name,
      l.location_name
    FROM attendance_logs al
    JOIN employees e ON e.id = al.employee_id
    LEFT JOIN cameras c ON c.id = al.camera_id
    LEFT JOIN locations l ON l.id = al.location_id
    WHERE 1=1
    ${activityScope}
    ORDER BY al.event_time DESC
    LIMIT 8
    `,
    activityValues
  );

  const monthRow = monthly.rows[0] || {
    full_day: 0,
    half_day: 0,
    absent: 0,
  };

  const monthlyBreakdown = [
    { name: "Present", value: monthRow.full_day, color: "#22c55e" },
    { name: "Half Day", value: monthRow.half_day, color: "#f59e0b" },
    { name: "Absent", value: monthRow.absent, color: "#f43f5e" },
  ];

  const monthTotal =
    monthRow.full_day + monthRow.half_day + monthRow.absent;
  const attendanceRate =
    monthTotal > 0
      ? Math.round((monthRow.full_day / monthTotal) * 100)
      : 0;

  const primaryCameraRow = [...cameraList].sort((a, b) => {
    const rank = (status: string) =>
      status === "ONLINE" ? 0 : status === "WARNING" ? 1 : 2;
    return rank(a.health_status) - rank(b.health_status);
  })[0];

  const primaryCamera = primaryCameraRow
    ? {
        id: primaryCameraRow.id,
        camera_name: primaryCameraRow.camera_name,
        location_name: primaryCameraRow.location_name,
        location_id: primaryCameraRow.location_id,
        health_status: primaryCameraRow.health_status,
        camera_ip: primaryCameraRow.camera_ip,
        port: primaryCameraRow.port,
        rtsp_url: primaryCameraRow.rtsp_url,
        brand: primaryCameraRow.brand,
        rtsp_channel: primaryCameraRow.rtsp_channel,
        rtsp_subtype: primaryCameraRow.rtsp_subtype,
        last_diagnostics: primaryCameraRow.last_diagnostics,
        reconnect_count: primaryCameraRow.reconnect_count,
      }
    : null;

  const faceStats = await getFaceRegistrationStats(scope.managerLocationId);

  return {
    employees: { total: totalEmployees },
    attendance_today: {
      present: presentToday,
      late: lateToday,
      absent: absentToday,
      half_day: halfDayToday,
    },
    cameras: {
      total: cameraStats.total,
      online: cameraStats.online,
      offline: cameraStats.offline,
      items: cameraList.map((camera) => ({
        id: camera.id,
        camera_name: camera.camera_name,
        health_status: camera.health_status,
        location_name: camera.location_name,
        location_id: camera.location_id,
        camera_ip: camera.camera_ip,
        port: camera.port,
        rtsp_url: camera.rtsp_url,
        brand: camera.brand,
        rtsp_channel: camera.rtsp_channel,
        rtsp_subtype: camera.rtsp_subtype,
        last_diagnostics: camera.last_diagnostics,
      })),
    },
    locations: locations.rows.map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      employee_count: row.employee_count,
      present_today: row.present_today,
      attendance_rate:
        row.employee_count > 0
          ? Math.round((row.present_today / row.employee_count) * 100)
          : 0,
    })),
    weekly_trend: weekly.rows.map((row) => ({
      day: row.day,
      present: row.present,
      late: row.late,
    })),
    monthly_breakdown: monthlyBreakdown,
    attendance_rate: attendanceRate,
    recent_activity: activity.rows.map((row) => ({
      title: `${row.employee_name} ${
        row.event_type === "CHECK_IN" ? "checked in" : "checked out"
      }`,
      source:
        row.camera_name ||
        row.location_name ||
        row.source ||
        "System",
      time: formatRelativeTimeIST(row.event_time),
      tone: row.event_type === "CHECK_IN" ? "emerald" : "violet",
    })),
    primary_camera: primaryCamera,
    face_registration: {
      registered: faceStats.registered,
      pending: faceStats.pending,
      partially_registered: faceStats.partially_registered,
      registration_percentage: faceStats.registration_percentage,
    },
  };
}

const EMPLOYEE_DETAIL_SELECT = `
  SELECT
    e.id AS employee_id,
    ar.id AS record_id,
    e.employee_code,
    TRIM(CONCAT(
      COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
      ' ',
      COALESCE(e.last_name, '')
    )) AS employee_name,
    e.email,
    e.mobile,
    e.department,
    e.designation,
    l.location_name,
    COALESCE(e.status, 'ACTIVE') AS employee_status,
    asum.check_in,
    asum.check_out,
    COALESCE(asum.attendance_status, 'NOT_CHECKED_IN') AS attendance_status,
    COALESCE(asum.late_minutes, 0)::int AS late_minutes,
    COALESCE(asum.working_hours, 0)::float AS working_hours
  FROM employees e
  LEFT JOIN locations l ON l.id = e.location_id
  LEFT JOIN attendance_summary asum ON asum.employee_id = e.id
    AND asum.attendance_date = CURRENT_DATE
  LEFT JOIN attendance_records ar ON ar.employee_id = e.id
    AND ar.attendance_date = CURRENT_DATE
`;

export async function getDashboardDetails(
  type: string,
  scope: DashboardScope = {}
) {
  const locationFilter = scope.managerLocationId
    ? "AND e.location_id = $1"
    : "";
  const locationValues = scope.managerLocationId
    ? [scope.managerLocationId]
    : [];

  if (type === "total_employees") {
    const result = await pool.query(
      `
      ${EMPLOYEE_DETAIL_SELECT}
      WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
      ${locationFilter}
      ORDER BY e.employee_code
      `,
      locationValues
    );

    return {
      title: "All Employees",
      type: "total_employees" as const,
      columns: [
        "employee_code",
        "employee_name",
        "department",
        "location_name",
        "attendance_status",
        "check_in",
        "check_out",
        "late_minutes",
        "working_hours",
      ],
      rows: result.rows.map(formatEmployeeRow),
    };
  }

  if (type === "present") {
    const result = await pool.query(
      `
      ${EMPLOYEE_DETAIL_SELECT}
      WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
        AND asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
      ${locationFilter}
      ORDER BY asum.check_in ASC NULLS LAST
      `,
      locationValues
    );

    return {
      title: "Present Today",
      type: "present" as const,
      columns: [
        "employee_code",
        "employee_name",
        "department",
        "location_name",
        "check_in",
        "check_out",
        "attendance_status",
        "working_hours",
      ],
      rows: result.rows.map(formatEmployeeRow),
    };
  }

  if (type === "late") {
    const result = await pool.query(
      `
      ${EMPLOYEE_DETAIL_SELECT}
      WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
        AND COALESCE(asum.late_minutes, 0) > 0
      ${locationFilter}
      ORDER BY asum.late_minutes DESC
      `,
      locationValues
    );

    return {
      title: "Late Employees Today",
      type: "late" as const,
      columns: [
        "employee_code",
        "employee_name",
        "department",
        "location_name",
        "check_in",
        "late_minutes",
        "attendance_status",
        "working_hours",
      ],
      rows: result.rows.map(formatEmployeeRow),
    };
  }

  if (type === "absent") {
    const result = await pool.query(
      `
      ${EMPLOYEE_DETAIL_SELECT}
      WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
        AND (
          asum.attendance_status = 'ABSENT'
          OR asum.attendance_status IS NULL
          OR asum.check_in IS NULL
        )
      ${locationFilter}
      ORDER BY e.employee_code
      `,
      locationValues
    );

    return {
      title: "Absent / Not Checked In",
      type: "absent" as const,
      columns: [
        "employee_code",
        "employee_name",
        "department",
        "location_name",
        "attendance_status",
        "employee_status",
      ],
      rows: result.rows.map(formatEmployeeRow),
    };
  }

  if (type === "half_day") {
    const result = await pool.query(
      `
      ${EMPLOYEE_DETAIL_SELECT}
      WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
        AND asum.attendance_status = 'HALF_DAY'
      ${locationFilter}
      ORDER BY e.employee_code
      `,
      locationValues
    );

    return {
      title: "Half Day Today",
      type: "half_day" as const,
      columns: [
        "employee_code",
        "employee_name",
        "department",
        "location_name",
        "check_in",
        "check_out",
        "working_hours",
      ],
      rows: result.rows.map(formatEmployeeRow),
    };
  }

  if (type === "faces_detected" || type === "faces_recognized") {
    const eventFilter =
      type === "faces_recognized"
        ? "AND fe.event_type = 'FACE_RECOGNIZED'"
        : "";
    const locationClause = scope.managerLocationId
      ? "AND fe.location_id = $1"
      : "";
    const values = scope.managerLocationId ? [scope.managerLocationId] : [];

    const result = await pool.query(
      `
      SELECT
        fe.id,
        fe.employee_id,
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
        fe.confidence,
        ROW_NUMBER() OVER (
          PARTITION BY fe.employee_id
          ORDER BY fe.event_time ASC, fe.id ASC
        ) AS scan_rank
      FROM face_events fe
      LEFT JOIN employees e ON e.id = fe.employee_id
      LEFT JOIN cameras c ON c.id = fe.camera_id
      LEFT JOIN locations l ON l.id = fe.location_id
      WHERE fe.event_time::date = CURRENT_DATE
      AND fe.employee_id IS NOT NULL
      AND ${scannableEmployeeFilterSql("fe.employee_id")}
      ${eventFilter}
      ${locationClause}
      ORDER BY fe.event_time DESC
      LIMIT 200
      `,
      values
    );

    const duplicateCount = result.rows.filter(
      (row) => Number(row.scan_rank) > 1 && row.employee_id
    ).length;

    return {
      title: type === "faces_recognized" ? "Faces Recognized Today" : "Faces Detected Today",
      type: type as "faces_detected" | "faces_recognized",
      columns: [
        "scan_status",
        "event_time",
        "event_type",
        "employee_code",
        "employee_name",
        "camera_name",
        "location_name",
        "confidence",
      ],
      rows: result.rows.map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        scan_status:
          row.employee_id && Number(row.scan_rank) > 1
            ? "Duplicate"
            : row.employee_id
              ? "First scan"
              : "Unknown",
        event_time: row.event_time
          ? new Date(String(row.event_time)).toLocaleString()
          : "—",
        event_type: row.event_type,
        confidence: row.confidence ?? "—",
        employee_name: row.employee_name || "Unknown",
        employee_code: row.employee_code || "—",
        camera_name: row.camera_name || "—",
        location_name: row.location_name || "—",
      })),
      meta: {
        duplicate_count: duplicateCount,
        total_count: result.rows.length,
      },
    };
  }

  if (type === "unknown_faces") {
    const locationClause = scope.managerLocationId
      ? "AND uf.location_id = $1"
      : "";
    const values = scope.managerLocationId ? [scope.managerLocationId] : [];

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
      WHERE uf.detected_at::date = CURRENT_DATE
      ${locationClause}
      ORDER BY uf.detected_at DESC
      LIMIT 200
      `,
      values
    );

    return {
      title: "Unknown Faces Today",
      type: "unknown_faces" as const,
      columns: [
        "detected_at",
        "camera_name",
        "location_name",
        "confidence",
        "image_path",
      ],
      rows: result.rows.map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        detected_at: row.detected_at
          ? new Date(String(row.detected_at)).toLocaleString()
          : "—",
        camera_name: row.camera_name || "—",
        location_name: row.location_name || "—",
        confidence: row.confidence ?? "—",
        image_path: row.image_path,
      })),
    };
  }

  if (type === "attendance_generated" || type === "recent_activity") {
    const locationClause = scope.managerLocationId
      ? "AND al.location_id = $1"
      : "";
    const values = scope.managerLocationId ? [scope.managerLocationId] : [];
    const sourceFilter =
      type === "attendance_generated"
        ? "AND al.source = 'AI_FACE_RECOGNITION'"
        : "";

    const result = await pool.query(
      `
      SELECT
        al.id AS log_id,
        al.event_time,
        al.event_type,
        al.source,
        TRIM(CONCAT(
          COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
          ' ',
          COALESCE(e.last_name, '')
        )) AS employee_name,
        e.employee_code,
        c.camera_name,
        l.location_name
      FROM attendance_logs al
      JOIN employees e ON e.id = al.employee_id
      LEFT JOIN cameras c ON c.id = al.camera_id
      LEFT JOIN locations l ON l.id = al.location_id
      WHERE al.event_time::date = CURRENT_DATE
      ${sourceFilter}
      ${locationClause}
      ORDER BY al.event_time DESC
      LIMIT 200
      `,
      values
    );

    return {
      title:
        type === "attendance_generated"
          ? "AI Attendance Generated Today"
          : "Recent Activity Today",
      type: type as "attendance_generated" | "recent_activity",
      columns: [
        "event_time",
        "event_type",
        "employee_code",
        "employee_name",
        "camera_name",
        "location_name",
        "source",
      ],
      rows: result.rows.map((row) => ({
        log_id: row.log_id,
        ...row,
        event_time: row.event_time
          ? new Date(String(row.event_time)).toLocaleString()
          : "—",
        camera_name: row.camera_name || row.location_name || "—",
        location_name: row.location_name || "—",
      })),
    };
  }

  if (
    type === "face_registered" ||
    type === "face_pending" ||
    type === "face_partial"
  ) {
    const statusFilter =
      type === "face_registered"
        ? `EXISTS (
            SELECT 1 FROM employee_face_images efi WHERE efi.employee_id = e.id
          )
          AND EXISTS (
            SELECT 1 FROM face_embeddings fem
            WHERE fem.employee_id = e.id
              AND fem.embedding_data IS NOT NULL
              AND fem.embedding_data <> ''
          )`
        : type === "face_partial"
          ? "COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'PARTIALLY_REGISTERED'"
          : "efp.id IS NULL OR COALESCE(efp.profile_status, 'NOT_REGISTERED') = 'NOT_REGISTERED'";

    const result = await pool.query(
      `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        TRIM(CONCAT(
          COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
          ' ',
          COALESCE(e.last_name, '')
        )) AS employee_name,
        l.location_name,
        COALESCE(efp.profile_status, 'NOT_REGISTERED') AS profile_status,
        COALESCE(efp.image_count, 0)::int AS image_count
      FROM employees e
      LEFT JOIN locations l ON l.id = e.location_id
      LEFT JOIN employee_face_profiles efp ON efp.employee_id = e.id
      WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
        AND ${statusFilter}
      ${locationFilter.replace(/^AND/, "AND")}
      ORDER BY e.employee_code
      `,
      locationValues
    );

    const titles = {
      face_registered: "AI Ready Employees",
      face_pending: "Pending Face Registration",
      face_partial: "Partially Registered Employees",
    };

    return {
      title: titles[type as keyof typeof titles],
      type: type as "face_registered" | "face_pending" | "face_partial",
      columns: [
        "employee_code",
        "employee_name",
        "location_name",
        "profile_status",
        "image_count",
      ],
      rows: result.rows.map((row) => ({
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        location_name: row.location_name || "—",
        profile_status: row.profile_status,
        image_count: row.image_count,
      })),
    };
  }

  if (type === "locations_overview") {
    const today = todayDate();
    const locationsScope = scope.managerLocationId ? "WHERE l.id = $2" : "";
    const locationsQueryValues = scope.managerLocationId
      ? [today, scope.managerLocationId]
      : [today];

    const result = await pool.query(
      `
      SELECT
        l.id AS location_id,
        l.location_name,
        COUNT(DISTINCT e.id)::int AS employee_count,
        COUNT(DISTINCT asum.employee_id) FILTER (
          WHERE asum.attendance_status IN ('FULL_DAY', 'HALF_DAY')
        )::int AS present_today,
        COUNT(DISTINCT c.id)::int AS camera_count
      FROM locations l
      LEFT JOIN employees e ON e.location_id = l.id
        AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
      LEFT JOIN attendance_summary asum ON asum.location_id = l.id
        AND asum.attendance_date = $1::date
      LEFT JOIN cameras c ON c.location_id = l.id
      ${locationsScope}
      GROUP BY l.id, l.location_name
      ORDER BY l.location_name
      `,
      locationsQueryValues
    );

    return {
      title: "Location Overview",
      type: "locations_overview" as const,
      columns: [
        "location_name",
        "employee_count",
        "present_today",
        "camera_count",
      ],
      rows: result.rows.map((row) => ({
        location_id: row.location_id,
        location_name: row.location_name,
        employee_count: row.employee_count,
        present_today: row.present_today,
        camera_count: row.camera_count,
      })),
    };
  }

  if (type === "cameras") {
    const cameras = await getCameras({
      managerLocationId: scope.managerLocationId,
    });

    return {
      title: "All Cameras",
      type: "cameras" as const,
      columns: [
        "camera_name",
        "location_name",
        "health_status",
        "status",
        "camera_ip",
        "last_seen",
      ],
      rows: cameras.map((camera) => ({
        id: camera.id,
        camera_name: camera.camera_name,
        location_name: camera.location_name || "—",
        health_status: camera.health_status,
        status: camera.status,
        camera_ip: camera.camera_ip || "—",
        last_seen: camera.last_seen
          ? new Date(camera.last_seen).toLocaleString()
          : "—",
      })),
    };
  }

  const userStatus =
    type === "users_active"
      ? "ACTIVE"
      : type === "users_disabled"
        ? "INACTIVE"
        : null;

  let userQuery = `
    SELECT
      u.id,
      u.username,
      u.full_name,
      u.email,
      u.role,
      COALESCE(u.status, 'ACTIVE') AS status,
      u.last_login_at
    FROM users u
  `;
  const userValues: unknown[] = [];

  if (userStatus) {
    userQuery += " WHERE COALESCE(u.status, 'ACTIVE') = $1";
    userValues.push(userStatus);
  }

  userQuery += " ORDER BY u.username";

  const users = await pool.query(userQuery, userValues);

  const titles: Record<string, string> = {
    users_all: "All System Users",
    users_active: "Active Users",
    users_disabled: "Disabled Users",
  };

  return {
    title: titles[type] || "Users",
    type: type as "users_all" | "users_active" | "users_disabled",
    columns: [
      "username",
      "full_name",
      "email",
      "role",
      "status",
      "last_login_at",
    ],
    rows: users.rows.map((row) => ({
      id: row.id,
      username: row.username,
      full_name: row.full_name || "—",
      email: row.email || "—",
      role: row.role,
      status: row.status,
      last_login_at: row.last_login_at
        ? new Date(row.last_login_at).toLocaleString()
        : "Never",
    })),
  };
}

function formatEmployeeRow(row: Record<string, unknown>) {
  return {
    employee_id: row.employee_id,
    record_id: row.record_id,
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    department: row.department || "—",
    location_name: row.location_name || "—",
    employee_status: row.employee_status,
    attendance_status: row.attendance_status,
    check_in: row.check_in
      ? new Date(String(row.check_in)).toLocaleTimeString()
      : "—",
    check_out: row.check_out
      ? new Date(String(row.check_out)).toLocaleTimeString()
      : "—",
    late_minutes: row.late_minutes,
    working_hours: row.working_hours,
    email: row.email || "—",
    mobile: row.mobile || "—",
    designation: row.designation || "—",
  };
}
