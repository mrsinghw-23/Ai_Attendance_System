import "server-only";

import pool from "@/lib/db";
import { captureCameraFrame } from "@/services/camera-frame-capture.service";
import { ingestFaceEventAndMarkAttendance } from "@/services/attendance-live.service";
import { matchFaceFromBuffer } from "@/services/live-face-match.service";
import { nowIsoInTimezone } from "@/utils/timezone";
import {
  getRecognitionCooldownMs,
  getUnknownFaceCooldownMs,
  isRecognitionOnCooldown,
  isUnknownFaceOnCooldown,
  markRecognitionCooldown,
  markUnknownFaceCooldown,
} from "@/services/recognition-cooldown.service";
import { saveUnknownFaceImage } from "@/utils/unknown-face-storage";
import { recordUnknownFace } from "@/services/ai-recognition.service";
import { shouldPersistUnknownFace } from "@/utils/unknown-face-policy";

export interface GateScanResult {
  camera_id: number;
  camera_name: string;
  at: string;
  face_detected: boolean;
  matched: boolean;
  marked: boolean;
  skipped?: boolean;
  skip_reason?: string;
  employee_id?: number;
  employee_name?: string;
  employee_code?: string;
  confidence?: number;
  action?: "CHECK_IN" | "CHECK_OUT" | "PRESENT";
  attendance_status?: string;
  event_time?: string;
  late_minutes?: number;
  message: string;
}

const recentResults = new Map<number, GateScanResult[]>();
let roundRobinIndex = 0;

function storeResult(result: GateScanResult) {
  const list = recentResults.get(result.camera_id) ?? [];
  recentResults.set(result.camera_id, [result, ...list].slice(0, 30));
}

export function listRecentGateScans(cameraId?: number, limit = 12) {
  if (cameraId) {
    return (recentResults.get(cameraId) ?? []).slice(0, limit);
  }

  return Array.from(recentResults.values())
    .flat()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export async function listGateCameras() {
  const result = await pool.query(
    `
    SELECT id, camera_name, location_id, entry_exit_type, camera_ip
    FROM cameras
    WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
      AND camera_ip IS NOT NULL
      AND TRIM(camera_ip) <> ''
    ORDER BY id
    `
  );
  return result.rows as Array<{
    id: number;
    camera_name: string;
    location_id: number | null;
    entry_exit_type: string;
    camera_ip: string;
  }>;
}

export async function scanCameraForGateAttendance(
  cameraId: number
): Promise<GateScanResult> {
  const cameraRow = await pool.query(
    `
    SELECT id, camera_name, location_id, entry_exit_type, COALESCE(status, 'ACTIVE') AS status
    FROM cameras
    WHERE id = $1
    `,
    [cameraId]
  );
  const camera = cameraRow.rows[0];
  if (!camera) {
    return {
      camera_id: cameraId,
      camera_name: `Camera ${cameraId}`,
      at: nowIsoInTimezone(),
      face_detected: false,
      matched: false,
      marked: false,
      message: "Camera not found",
    };
  }

  if (String(camera.status) === "INACTIVE") {
    const result: GateScanResult = {
      camera_id: cameraId,
      camera_name: String(camera.camera_name),
      at: nowIsoInTimezone(),
      face_detected: false,
      matched: false,
      marked: false,
      message: "Camera is disabled",
    };
    storeResult(result);
    return result;
  }

  const at = nowIsoInTimezone();
  const base = {
    camera_id: cameraId,
    camera_name: String(camera.camera_name),
    at,
  };

  const frame = await captureCameraFrame(cameraId, { preview: false, ttlMs: 0 });
  if (!frame) {
    const result: GateScanResult = {
      ...base,
      face_detected: false,
      matched: false,
      marked: false,
      message: "Could not capture camera frame",
    };
    storeResult(result);
    return result;
  }

  const locationId = camera.location_id as number | null;
  const match = await matchFaceFromBuffer(frame);

  if (!match.face_detected) {
    const result: GateScanResult = {
      ...base,
      face_detected: false,
      matched: false,
      marked: false,
      message: "Watching — no face in frame",
    };
    storeResult(result);
    return result;
  }

  if (!match.matched || !match.employee_id) {
    const persistUnknown = await shouldPersistUnknownFace("gate_scan");
    if (persistUnknown && match.face_detected && frame) {
      const unknownCooldownMs = await getUnknownFaceCooldownMs();
      if (!isUnknownFaceOnCooldown(cameraId, unknownCooldownMs)) {
        try {
          const imagePath = await saveUnknownFaceImage(frame, cameraId);
          await recordUnknownFace({
            cameraId,
            locationId,
            imagePath,
            confidence: match.confidence ?? null,
            metadata: {
              source: "gate_scan",
              camera_name: camera.camera_name,
            },
          });
          markUnknownFaceCooldown(cameraId);
        } catch {
          // ignore storage errors
        }
      }
    }

    const result: GateScanResult = {
      ...base,
      face_detected: true,
      matched: false,
      marked: false,
      confidence: match.confidence,
      message: "Face detected — not a registered employee",
    };
    storeResult(result);
    return result;
  }

  const cooldownMs = await getRecognitionCooldownMs();
  if (isRecognitionOnCooldown(cameraId, match.employee_id, cooldownMs)) {
    const result: GateScanResult = {
      ...base,
      face_detected: true,
      matched: true,
      marked: false,
      skipped: true,
      skip_reason: "cooldown",
      employee_id: match.employee_id,
      employee_name: match.employee_name,
      employee_code: match.employee_code,
      confidence: match.confidence,
      message: `${match.employee_name || "Employee"} already marked recently`,
    };
    storeResult(result);
    return result;
  }

  const eventTime = nowIsoInTimezone();
  const { attendance, skipped, skipReason } =
    await ingestFaceEventAndMarkAttendance({
      camera_id: cameraId,
      employee_id: match.employee_id,
      location_id: locationId,
      event_time: eventTime,
      confidence: match.confidence ?? null,
      event_type: "FACE_RECOGNIZED",
      metadata: {
        employee_name: match.employee_name,
        employee_code: match.employee_code,
        source: "gate_scan",
        camera_name: camera.camera_name,
      },
      create_attendance_log: false,
    });

  if (attendance) {
    markRecognitionCooldown(cameraId, match.employee_id);
    const result: GateScanResult = {
      ...base,
      at: eventTime,
      face_detected: true,
      matched: true,
      marked: true,
      employee_id: attendance.employee_id,
      employee_name: attendance.employee_name,
      employee_code: attendance.employee_code,
      confidence: attendance.confidence,
      action: attendance.action,
      attendance_status: attendance.attendance_status,
      event_time: attendance.event_time,
      late_minutes: attendance.late_minutes,
      message: `${attendance.action} · ${attendance.attendance_status || "Marked"} · ${attendance.employee_name}`,
    };
    storeResult(result);
    return result;
  }

  if (skipped) {
    markRecognitionCooldown(cameraId, match.employee_id);
    const result: GateScanResult = {
      ...base,
      at: eventTime,
      face_detected: true,
      matched: true,
      marked: false,
      skipped: true,
      skip_reason: skipReason,
      employee_id: match.employee_id,
      employee_name: match.employee_name,
      employee_code: match.employee_code,
      confidence: match.confidence,
      message: `${match.employee_name || "Employee"}: ${skipReason || "Skipped"}`,
    };
    storeResult(result);
    return result;
  }

  const result: GateScanResult = {
    ...base,
    face_detected: true,
    matched: true,
    marked: false,
    employee_id: match.employee_id,
    employee_name: match.employee_name,
    employee_code: match.employee_code,
    confidence: match.confidence,
    message: "Matched but attendance was not updated",
  };
  storeResult(result);
  return result;
}

export async function scanNextGateCamera(): Promise<GateScanResult | null> {
  const cameras = await listGateCameras();
  if (!cameras.length) return null;

  const camera = cameras[roundRobinIndex % cameras.length];
  roundRobinIndex += 1;
  return scanCameraForGateAttendance(camera.id);
}
