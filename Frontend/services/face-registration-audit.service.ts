import pool from "@/lib/db";
import { FaceImageType } from "@/types/face-registration";

export type FaceRegistrationAuditEvent =
  | "SESSION_STARTED"
  | "POSE_CAPTURED"
  | "POSE_RETAKE"
  | "SESSION_COMPLETED"
  | "EMBEDDINGS_GENERATED"
  | "SESSION_CANCELLED";

export async function logFaceRegistrationAudit(input: {
  employeeId: number;
  faceProfileId?: number | null;
  sessionId: string;
  eventType: FaceRegistrationAuditEvent;
  imageType?: FaceImageType;
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}) {
  const result = await pool.query(
    `
    INSERT INTO face_registration_audit_log (
      employee_id,
      face_profile_id,
      session_id,
      event_type,
      image_type,
      quality_score,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [
      input.employeeId,
      input.faceProfileId ?? null,
      input.sessionId,
      input.eventType,
      input.imageType ?? null,
      input.qualityScore ?? null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  return result.rows[0];
}

export async function listFaceRegistrationAudit(
  employeeId: number,
  limit = 50
) {
  const result = await pool.query(
    `
    SELECT *
    FROM face_registration_audit_log
    WHERE employee_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [employeeId, limit]
  );

  return result.rows;
}
