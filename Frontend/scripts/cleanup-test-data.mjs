/**
 * Removes test/example data inserted by phase test scripts.
 * Keeps real camera, employee, and attendance data untouched.
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

async function main() {
  console.log("Cleaning test/example data...\n");

  const faceEvents = await pool.query(
    `
    DELETE FROM face_events
    WHERE metadata->>'source' IN ('phase12-test', 'test', 'phase9-test')
       OR event_time >= '2030-01-01'
    RETURNING id
    `
  );
  console.log(`  Removed ${faceEvents.rowCount} test face_events`);

  const unknownFaces = await pool.query(
    `
    DELETE FROM unknown_faces
    WHERE metadata->>'source' IN ('phase12-test', 'test')
    RETURNING id
    `
  );
  console.log(`  Removed ${unknownFaces.rowCount} test unknown_faces`);

  await pool.query(
    `
    UPDATE ai_recognition_stats
    SET faces_detected = GREATEST(
          faces_detected - (
            SELECT COUNT(*) FROM face_events fe
            WHERE fe.event_time::date = ai_recognition_stats.stat_date
              AND fe.metadata->>'source' IN ('phase12-test', 'test')
          ),
          0
        ),
        faces_recognized = GREATEST(
          faces_recognized - (
            SELECT COUNT(*) FROM face_events fe
            WHERE fe.event_time::date = ai_recognition_stats.stat_date
              AND fe.event_type = 'FACE_RECOGNIZED'
              AND fe.metadata->>'source' IN ('phase12-test', 'test')
          ),
          0
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days'
    `
  );
  console.log("  Adjusted ai_recognition_stats counters");

  const aiEvents = await pool.query(
    `
    DELETE FROM ai_recognition_events
    WHERE message ILIKE '%test%'
    RETURNING id
    `
  );
  console.log(`  Removed ${aiEvents.rowCount} test ai_recognition_events`);

  console.log("\nCleanup complete. Real data preserved.");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
