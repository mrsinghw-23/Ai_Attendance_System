/**
 * Clears all attendance / presence / face-event data.
 * Use before go-live when the system was tested with sample records.
 *
 * Keeps: employees, cameras, locations, users, face registrations.
 */
import pg from "pg";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  database: process.env.DB_NAME || "ai_attendance_db",
  password: process.env.DB_PASSWORD || "postgres@123",
  port: Number(process.env.DB_PORT || 5432),
});

async function count(table) {
  const result = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return result.rows[0].c;
}

async function main() {
  console.log("Resetting all attendance & recognition event data...\n");

  const before = {
    attendance_records: await count("attendance_records"),
    attendance_logs: await count("attendance_logs"),
    attendance_summary: await count("attendance_summary"),
    presence_logs: await count("employee_presence_logs"),
    presence_state: await count("employee_presence_state"),
    face_events: await count("face_events"),
    unknown_faces: await count("unknown_faces"),
  };

  console.log("Before:", before);

  await pool.query("BEGIN");

  await pool.query(`DELETE FROM employee_presence_logs`);
  await pool.query(`DELETE FROM employee_presence_state`);
  await pool.query(`DELETE FROM attendance_logs`);
  await pool.query(`DELETE FROM attendance_summary`);
  await pool.query(`DELETE FROM attendance_records`);
  await pool.query(`DELETE FROM face_events`);
  await pool.query(`DELETE FROM unknown_faces`);
  await pool.query(`DELETE FROM ai_recognition_events`);
  await pool.query(`
    UPDATE ai_recognition_stats
    SET
      faces_detected = 0,
      faces_recognized = 0,
      unknown_faces = 0,
      attendance_generated = 0,
      active_cameras = 0,
      updated_at = CURRENT_TIMESTAMP
  `);
  await pool.query(`DELETE FROM attendance_engine_runs`);
  await pool.query(`DELETE FROM camera_events WHERE event_type IN (
    'AI_FACE_EVENT_LINKED', 'MOTION_DETECTED'
  )`);

  // Legacy table from early migrations (if present)
  await pool.query(`DELETE FROM attendance`).catch(() => {});

  await pool.query("COMMIT");

  const after = {
    attendance_records: await count("attendance_records"),
    attendance_logs: await count("attendance_logs"),
    face_events: await count("face_events"),
  };

  console.log("\nAfter:", after);
  console.log("\nAll attendance reports, logs, graphs, and timeline data cleared.");
  console.log("Employees, cameras, and face registrations were kept.\n");

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await pool.query("ROLLBACK");
  } catch {}
  await pool.end();
  process.exit(1);
});
