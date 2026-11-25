import pool from "@/lib/db";
import { scannableEmployeeFilterSql } from "@/services/employee-encoding-cache.service";

const SCANNABLE_FACE_EVENT = scannableEmployeeFilterSql("fe.employee_id");

function todayScannableFaceEventsWhere(extra = "") {
  return `
    WHERE fe.event_time::date = CURRENT_DATE
      AND fe.employee_id IS NOT NULL
      AND ${SCANNABLE_FACE_EVENT}
      ${extra}
  `;
}

export async function syncAIRecognitionStatsForToday() {
  const counts = await pool.query(
    `
    SELECT
      COUNT(*)::int AS faces_detected_total,
      COUNT(DISTINCT fe.employee_id)::int AS faces_detected_unique,
      COUNT(*) FILTER (
        WHERE fe.event_type = 'FACE_RECOGNIZED'
      )::int AS faces_recognized_total,
      COUNT(DISTINCT fe.employee_id) FILTER (
        WHERE fe.event_type = 'FACE_RECOGNIZED'
      )::int AS faces_recognized_unique
    FROM face_events fe
    ${todayScannableFaceEventsWhere()}
    `
  );

  const row = counts.rows[0] || {};
  await pool.query(
    `
    INSERT INTO ai_recognition_stats (stat_date, faces_detected, faces_recognized, updated_at)
    VALUES (
      CURRENT_DATE,
      $1,
      $2,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (stat_date)
    DO UPDATE SET
      faces_detected = EXCLUDED.faces_detected,
      faces_recognized = EXCLUDED.faces_recognized,
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      Number(row.faces_detected_unique || 0),
      Number(row.faces_recognized_unique || 0),
    ]
  );

  return {
    faces_detected_total: Number(row.faces_detected_total || 0),
    faces_detected_unique: Number(row.faces_detected_unique || 0),
    faces_recognized_total: Number(row.faces_recognized_total || 0),
    faces_recognized_unique: Number(row.faces_recognized_unique || 0),
  };
}

export async function purgeFaceEventsForEmployee(employeeId: number) {
  const result = await pool.query(
    `DELETE FROM face_events WHERE employee_id = $1 RETURNING id`,
    [employeeId]
  );
  if ((result.rowCount ?? 0) > 0) {
    await syncAIRecognitionStatsForToday();
  }
  return { deleted: result.rowCount ?? 0 };
}

export async function purgeStaleFaceEvents() {
  const result = await pool.query(
    `
    DELETE FROM face_events fe
    WHERE fe.employee_id IS NOT NULL
      AND NOT ${scannableEmployeeFilterSql("fe.employee_id")}
    RETURNING fe.id
    `
  );
  if ((result.rowCount ?? 0) > 0) {
    await syncAIRecognitionStatsForToday();
  }
  return { deleted: result.rowCount ?? 0 };
}

export async function dedupeTodayFaceEvents(options: {
  scope: "recognized" | "detected";
  locationId?: number | null;
}) {
  const recognizedOnly = options.scope === "recognized";
  const values: unknown[] = [];
  let locationClause = "";
  if (options.locationId) {
    values.push(options.locationId);
    locationClause = `AND fe.location_id = $${values.length}`;
  }

  const typeClause = recognizedOnly
    ? "AND fe.event_type = 'FACE_RECOGNIZED'"
    : "";

  const result = await pool.query(
    `
    DELETE FROM face_events fe
    WHERE fe.event_time::date = CURRENT_DATE
      AND fe.employee_id IS NOT NULL
      AND ${SCANNABLE_FACE_EVENT}
      ${typeClause}
      ${locationClause}
      AND fe.id NOT IN (
        SELECT DISTINCT ON (fe2.employee_id) fe2.id
        FROM face_events fe2
        WHERE fe2.event_time::date = CURRENT_DATE
          AND fe2.employee_id IS NOT NULL
          AND ${scannableEmployeeFilterSql("fe2.employee_id")}
          ${typeClause.replace(/fe\./g, "fe2.")}
          ${locationClause.replace(/fe\./g, "fe2.")}
        ORDER BY fe2.employee_id, fe2.event_time ASC, fe2.id ASC
      )
    RETURNING fe.id
    `,
    values
  );

  const stats = await syncAIRecognitionStatsForToday();
  return { deleted: result.rowCount ?? 0, stats };
}

export async function deleteAllTodayFaceEvents(options: {
  scope: "recognized" | "detected";
  locationId?: number | null;
}) {
  const locationClause = options.locationId
    ? "AND fe.location_id = $1"
    : "";
  const values: unknown[] = options.locationId ? [options.locationId] : [];

  const eventFilter =
    options.scope === "recognized"
      ? "AND fe.event_type = 'FACE_RECOGNIZED'"
      : "";

  const result = await pool.query(
    `
    DELETE FROM face_events fe
    WHERE fe.event_time::date = CURRENT_DATE
      AND fe.employee_id IS NOT NULL
      AND ${SCANNABLE_FACE_EVENT}
      ${eventFilter}
      ${locationClause}
    RETURNING fe.id
    `,
    values
  );

  const stats = await syncAIRecognitionStatsForToday();
  return { deleted: result.rowCount ?? 0, stats };
}

export async function deleteFaceEventById(id: number) {
  const result = await pool.query(
    `DELETE FROM face_events WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!result.rows[0]) return null;
  await syncAIRecognitionStatsForToday();
  return result.rows[0].id as number;
}

export async function getTodayFaceEventCounts() {
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS faces_detected_total,
      COUNT(DISTINCT fe.employee_id)::int AS faces_detected_unique,
      COUNT(*) FILTER (
        WHERE fe.event_type = 'FACE_RECOGNIZED'
      )::int AS faces_recognized_total,
      COUNT(DISTINCT fe.employee_id) FILTER (
        WHERE fe.event_type = 'FACE_RECOGNIZED'
      )::int AS faces_recognized_unique
    FROM face_events fe
    ${todayScannableFaceEventsWhere()}
    `
  );
  return result.rows[0] || {};
}
