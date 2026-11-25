import pool from "@/lib/db";

export async function deleteAllTodayAttendanceLogs(options: {
  aiOnly?: boolean;
  locationId?: number | null;
}) {
  const values: unknown[] = [];
  let idx = 1;
  const clauses = ["al.event_time::date = CURRENT_DATE"];

  if (options.aiOnly) {
    clauses.push("al.source = 'AI_FACE_RECOGNITION'");
  }
  if (options.locationId) {
    clauses.push(`al.location_id = $${idx++}`);
    values.push(options.locationId);
  }

  const result = await pool.query(
    `
    DELETE FROM attendance_logs al
    WHERE ${clauses.join(" AND ")}
    RETURNING al.id
    `,
    values
  );

  return { deleted: result.rowCount ?? 0 };
}
