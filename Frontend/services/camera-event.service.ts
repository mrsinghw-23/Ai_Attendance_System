import pool from "@/lib/db";
import { CameraEvent, CameraEventType } from "@/types/camera";
import { createNotification } from "@/services/notification.service";
import { publishRealtimeEvent } from "@/services/realtime.service";

function mapEvent(row: Record<string, unknown>): CameraEvent {
  return {
    id: row.id as number,
    camera_id: row.camera_id as number,
    camera_name: (row.camera_name as string) || undefined,
    event_type: row.event_type as CameraEventType,
    message: (row.message as string) || null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: String(row.created_at),
  };
}

export async function createCameraEvent(input: {
  cameraId: number;
  eventType: CameraEventType;
  message?: string;
  metadata?: Record<string, unknown>;
  notify?: boolean;
}) {
  const result = await pool.query(
    `
    INSERT INTO camera_events (camera_id, event_type, message, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [
      input.cameraId,
      input.eventType,
      input.message || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  const event = mapEvent({
    ...result.rows[0],
    metadata: input.metadata || {},
  });

  publishRealtimeEvent("camera.event", {
    ...event,
  });

  if (input.notify) {
    await notifyForCameraEvent(event);
  }

  return event;
}

async function notifyForCameraEvent(event: CameraEvent) {
  const titles: Partial<Record<CameraEventType, string>> = {
    CAMERA_OFFLINE: "Camera offline",
    STREAM_ERROR: "RTSP stream failure",
    HEALTH_WARNING: "Camera health warning",
    MOTION_DETECTED: "Motion detected",
    AI_FACE_EVENT_LINKED: "AI face event linked",
  };

  const priorities: Partial<
    Record<CameraEventType, "LOW" | "NORMAL" | "HIGH">
  > = {
    CAMERA_OFFLINE: "HIGH",
    STREAM_ERROR: "HIGH",
    HEALTH_WARNING: "NORMAL",
    MOTION_DETECTED: "LOW",
    AI_FACE_EVENT_LINKED: "NORMAL",
  };

  const title = titles[event.event_type];
  if (!title) return;

  await createNotification({
    role: "SUPER_ADMIN",
    title,
    message:
      event.message ||
      `${event.camera_name || "Camera"} reported ${event.event_type}`,
    type: "CAMERA",
    priority: priorities[event.event_type] || "NORMAL",
    entityType: "camera",
    entityId: event.camera_id,
  });

  await createNotification({
    role: "CAMERA_ADMIN",
    title,
    message:
      event.message ||
      `${event.camera_name || "Camera"} reported ${event.event_type}`,
    type: "CAMERA",
    priority: priorities[event.event_type] || "NORMAL",
    entityType: "camera",
    entityId: event.camera_id,
  });
}

export async function getCameraEvents(options: {
  cameraId?: number;
  eventType?: CameraEventType;
  limit?: number;
  managerLocationId?: number | null;
} = {}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.cameraId) {
    conditions.push(`ce.camera_id = $${paramIndex++}`);
    values.push(options.cameraId);
  }

  if (options.eventType) {
    conditions.push(`ce.event_type = $${paramIndex++}`);
    values.push(options.eventType);
  }

  if (options.managerLocationId) {
    conditions.push(`c.location_id = $${paramIndex++}`);
    values.push(options.managerLocationId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit || 50;

  const result = await pool.query(
    `
    SELECT ce.*, c.camera_name
    FROM camera_events ce
    JOIN cameras c ON c.id = ce.camera_id
    ${whereClause}
    ORDER BY ce.created_at DESC
    LIMIT ${limit}
    `,
    values
  );

  return result.rows.map(mapEvent);
}

export async function recordMotionEvent(
  cameraId: number,
  message?: string
) {
  await pool.query(
    `
    UPDATE cameras
    SET last_motion_detected = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [cameraId]
  );

  return createCameraEvent({
    cameraId,
    eventType: "MOTION_DETECTED",
    message: message || "Motion detected on camera",
    notify: true,
  });
}

export async function linkFaceEventToCamera(
  cameraId: number,
  faceEventId: number,
  employeeName?: string
) {
  return createCameraEvent({
    cameraId,
    eventType: "AI_FACE_EVENT_LINKED",
    message: employeeName
      ? `Face recognized: ${employeeName}`
      : "AI face event linked to camera",
    metadata: { face_event_id: faceEventId },
    notify: true,
  });
}
