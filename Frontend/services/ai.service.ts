import pool from "@/lib/db";
import { FaceEventInput, FaceProfileInput } from "@/schemas/ai.schema";
import { publishRealtimeEvent } from "@/services/realtime.service";

export async function upsertFaceProfile(input: FaceProfileInput) {
  const result = await pool.query(
    `
    INSERT INTO employee_face_profiles (
      employee_id,
      profile_status,
      image_count,
      embedding_model,
      metadata,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (employee_id)
    DO UPDATE SET
      profile_status = EXCLUDED.profile_status,
      image_count = EXCLUDED.image_count,
      embedding_model = EXCLUDED.embedding_model,
      metadata = EXCLUDED.metadata,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [
      input.employee_id,
      input.profile_status,
      input.image_count,
      input.embedding_model || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  publishRealtimeEvent("ai.face_profile.updated", result.rows[0]);
  return result.rows[0];
}

export async function listFaceProfiles() {
  const result = await pool.query(
    `
    SELECT
      efp.*,
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee_name
    FROM employee_face_profiles efp
    JOIN employees e ON e.id = efp.employee_id
    ORDER BY efp.updated_at DESC
    LIMIT 200
    `
  );

  return result.rows;
}

export async function ingestFaceEvent(input: FaceEventInput) {
  let attendanceLogId: number | null = null;

  if (
    input.create_attendance_log &&
    input.employee_id &&
    ["CHECK_IN", "CHECK_OUT"].includes(input.event_type)
  ) {
    const log = await pool.query(
      `
      INSERT INTO attendance_logs (
        employee_id,
        location_id,
        event_type,
        event_time,
        source,
        camera_id
      )
      VALUES ($1, $2, $3, $4, 'AI_FACE_RECOGNITION', $5)
      RETURNING id
      `,
      [
        input.employee_id,
        input.location_id || null,
        input.event_type,
        input.event_time,
        input.camera_id || null,
      ]
    );
    attendanceLogId = log.rows[0].id;
  }

  const result = await pool.query(
    `
    INSERT INTO face_events (
      camera_id,
      employee_id,
      location_id,
      event_time,
      confidence,
      event_type,
      image_ref,
      embedding_ref,
      metadata,
      processed,
      attendance_log_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      input.camera_id || null,
      input.employee_id || null,
      input.location_id || null,
      input.event_time,
      input.confidence ?? null,
      input.event_type,
      input.image_ref || null,
      input.embedding_ref || null,
      JSON.stringify(input.metadata || {}),
      Boolean(attendanceLogId),
      attendanceLogId,
    ]
  );

  publishRealtimeEvent("ai.face_event.ingested", result.rows[0]);

  if (input.camera_id) {
    const { linkFaceEventToCamera } = await import(
      "@/services/camera-event.service"
    );
    await linkFaceEventToCamera(
      input.camera_id,
      result.rows[0].id,
      undefined
    );
  }

  return result.rows[0];
}

export async function listFaceEvents() {
  const result = await pool.query(
    `
    SELECT
      fe.*,
      c.camera_name,
      e.employee_code,
      TRIM(CONCAT(COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''), ' ', COALESCE(e.last_name, ''))) AS employee_name,
      l.location_name
    FROM face_events fe
    LEFT JOIN cameras c ON c.id = fe.camera_id
    LEFT JOIN employees e ON e.id = fe.employee_id
    LEFT JOIN locations l ON l.id = fe.location_id
    ORDER BY fe.event_time DESC
    LIMIT 200
    `
  );

  return result.rows;
}
