import pool from "@/lib/db";
import { CameraHealthStatus, CameraDiagnostics } from "@/types/camera";
import { createNotification } from "@/services/notification.service";
import { publishRealtimeEvent } from "@/services/realtime.service";
import { createCameraEvent } from "@/services/camera-event.service";
import { formatProbeErrorCode } from "@/utils/camera-probe-errors";
import { probeCameraById } from "@/services/camera-probe.service";
import { saveCameraDiagnostics } from "@/services/camera.service";

async function probeCamera(camera: Record<string, unknown>) {
  if (camera.health_status === "MAINTENANCE") {
    return {
      healthStatus: "MAINTENANCE" as CameraHealthStatus,
      cameraReachable: false,
      rtspReachable: false,
      streamAvailable: false,
      responseTimeMs: null as number | null,
      message: "Camera is under maintenance",
      diagnostics: null as CameraDiagnostics | null,
    };
  }

  const cameraId = Number(camera.id);
  const ip = String(camera.camera_ip || "");

  if (!ip || !Number.isInteger(cameraId) || cameraId <= 0) {
    return {
      healthStatus: "OFFLINE" as CameraHealthStatus,
      cameraReachable: false,
      rtspReachable: false,
      streamAvailable: false,
      responseTimeMs: null,
      message: "Camera IP not configured",
      diagnostics: null,
    };
  }

  const diagnostics = await probeCameraById(cameraId);
  const cameraReachable = Boolean(
    diagnostics.camera_reachable || diagnostics.tcp_rtsp_ok
  );
  const rtspReachable = Boolean(diagnostics.rtsp_connected);
  const streamAvailable = Boolean(diagnostics.frame_captured);
  const responseTimeMs = diagnostics.latency_ms ?? null;

  let message = streamAvailable
    ? `RTSP stream OK · ${diagnostics.resolution || "frame captured"}`
    : formatProbeErrorCode(diagnostics.error_code);

  if (diagnostics.latency_ms != null) {
    message += ` · ${diagnostics.latency_ms}ms`;
  }

  let healthStatus: CameraHealthStatus =
    (diagnostics.health_status as CameraHealthStatus) || "OFFLINE";

  if (!streamAvailable && cameraReachable) {
    healthStatus = "WARNING";
  }

  return {
    healthStatus,
    cameraReachable,
    rtspReachable,
    streamAvailable,
    responseTimeMs,
    message,
    diagnostics: {
      ...diagnostics,
      checked_at: new Date().toISOString(),
    },
  };
}

export async function runCameraHealthCheck() {
  const cameras = await pool.query(
    `
    SELECT
      id, camera_name, camera_ip, port, rtsp_url,
      rtsp_username, rtsp_password_enc, health_status, status
    FROM cameras
    ORDER BY id
    `
  );

  const results = [];

  for (const camera of cameras.rows) {
    const probe = await probeCamera(camera);
    const previousStatus = camera.health_status as string;

    if (probe.diagnostics) {
      await saveCameraDiagnostics(
        camera.id,
        probe.diagnostics as CameraDiagnostics
      );
    }

    await pool.query(
      `
      INSERT INTO camera_health_logs (
        camera_id, health_status, latency_ms,
        camera_reachable, rtsp_reachable, stream_available, message, diagnostics
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        camera.id,
        probe.healthStatus,
        probe.responseTimeMs,
        probe.cameraReachable,
        probe.rtspReachable,
        probe.streamAvailable,
        probe.message,
        probe.diagnostics ? JSON.stringify(probe.diagnostics) : null,
      ]
    );

    await pool.query(
      `
      UPDATE cameras
      SET health_status = $1::varchar,
          last_seen = CASE WHEN $1::text = 'ONLINE' THEN CURRENT_TIMESTAMP ELSE last_seen END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [probe.healthStatus, camera.id]
    );

    publishRealtimeEvent("camera.health", {
      cameraId: camera.id,
      cameraName: camera.camera_name,
      healthStatus: probe.healthStatus,
      message: probe.message,
      cameraReachable: probe.cameraReachable,
      rtspReachable: probe.rtspReachable,
      streamAvailable: probe.streamAvailable,
      responseTimeMs: probe.responseTimeMs,
    });

    if (probe.healthStatus === "OFFLINE" && previousStatus !== "OFFLINE") {
      await createCameraEvent({
        cameraId: camera.id,
        eventType: "CAMERA_OFFLINE",
        message: `${camera.camera_name} went offline`,
        notify: true,
      });
    }

    if (probe.healthStatus === "ONLINE" && previousStatus === "OFFLINE") {
      await createCameraEvent({
        cameraId: camera.id,
        eventType: "CAMERA_ONLINE",
        message: `${camera.camera_name} is back online`,
      });
    }

    if (probe.healthStatus === "WARNING") {
      await createCameraEvent({
        cameraId: camera.id,
        eventType: probe.rtspReachable ? "HEALTH_WARNING" : "STREAM_ERROR",
        message: probe.message,
        notify: previousStatus !== "WARNING",
      });
    }

    if (
      probe.healthStatus === "OFFLINE" &&
      previousStatus !== "OFFLINE"
    ) {
      await createNotification({
        role: "SUPER_ADMIN",
        title: "Camera offline",
        message: `${camera.camera_name} is offline or unreachable.`,
        type: "CAMERA",
        priority: "HIGH",
        entityType: "camera",
        entityId: camera.id,
      });
      await createNotification({
        role: "CAMERA_ADMIN",
        title: "Camera offline",
        message: `${camera.camera_name} is offline or unreachable.`,
        type: "CAMERA",
        priority: "HIGH",
        entityType: "camera",
        entityId: camera.id,
      });
    }

    results.push({
      camera_id: camera.id,
      camera_name: camera.camera_name,
      health_status: probe.healthStatus,
      camera_reachable: probe.cameraReachable,
      rtsp_reachable: probe.rtspReachable,
      stream_available: probe.streamAvailable,
      response_time_ms: probe.responseTimeMs,
      message: probe.message,
    });
  }

  return results;
}

export async function getCameraHealthLogs(
  cameraId?: number,
  managerLocationId?: number | null
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (cameraId) {
    conditions.push(`chl.camera_id = $${paramIndex++}`);
    values.push(cameraId);
  }

  if (managerLocationId) {
    conditions.push(`c.location_id = $${paramIndex++}`);
    values.push(managerLocationId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      chl.id,
      chl.camera_id,
      c.camera_name,
      chl.health_status,
      chl.latency_ms,
      COALESCE(chl.camera_reachable, FALSE) AS camera_reachable,
      COALESCE(chl.rtsp_reachable, FALSE) AS rtsp_reachable,
      COALESCE(chl.stream_available, FALSE) AS stream_available,
      chl.message,
      chl.checked_at
    FROM camera_health_logs chl
    JOIN cameras c ON c.id = chl.camera_id
    ${whereClause}
    ORDER BY chl.checked_at DESC
    LIMIT 100
    `,
    values
  );

  return result.rows.map((row) => ({
    id: row.id as number,
    camera_id: row.camera_id as number,
    camera_name: row.camera_name as string,
    health_status: row.health_status as CameraHealthStatus,
    latency_ms: row.latency_ms != null ? Number(row.latency_ms) : null,
    camera_reachable: Boolean(row.camera_reachable),
    rtsp_reachable: Boolean(row.rtsp_reachable),
    stream_available: Boolean(row.stream_available),
    message: (row.message as string) || null,
    checked_at: String(row.checked_at),
  }));
}
