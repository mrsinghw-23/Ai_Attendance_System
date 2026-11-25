import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { isAIServiceRequest } from "@/utils/ai-service-auth";
import { canViewCameras } from "@/utils/permissions";
import { nowIsoInTimezone } from "@/utils/timezone";
import pool from "@/lib/db";
import { ingestFaceEvent } from "@/services/ai.service";
import { ingestFaceEventAndMarkAttendance } from "@/services/attendance-live.service";
import {
  getEmployeeEncodingCache,
  matchEmployeeFromEncoding,
  employeeCanBeFaceScanned,
} from "@/services/employee-encoding-cache.service";
import { getAIRecognitionSettings } from "@/services/ai-recognition.service";
import {
  listGateCameras,
  listRecentGateScans,
  scanCameraForGateAttendance,
  scanNextGateCamera,
} from "@/services/gate-attendance.service";

export const dynamic = "force-dynamic";
const COOLDOWN_MS = 30_000;
const recentMatchCooldown = new Map<string, number>();
const METRICS_WINDOW_MS = 60_000;
const latencySamplesMs: number[] = [];
let metricsWindowStartedAt = Date.now();

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function observeLatency(processingMs: number) {
  latencySamplesMs.push(processingMs);
  const now = Date.now();
  if (now - metricsWindowStartedAt < METRICS_WINDOW_MS) return;

  const sorted = [...latencySamplesMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  console.info(
    `[gate-scan] latency window=${METRICS_WINDOW_MS / 1000}s count=${sorted.length} p50=${p50}ms p95=${p95}ms`
  );

  latencySamplesMs.length = 0;
  metricsWindowStartedAt = now;
}

function successResponse(
  data: unknown,
  startedAtMs: number,
  init?: ResponseInit
) {
  const processingMs = Math.round(performance.now() - startedAtMs);
  observeLatency(processingMs);
  const response = NextResponse.json(
    {
      success: true,
      data,
      processing_ms: processingMs,
    },
    init
  );
  response.headers.set("X-Processing-Ms", String(processingMs));
  return response;
}

function isOnCooldown(cameraId: number, employeeId: number) {
  const key = `${cameraId}:${employeeId}`;
  const last = recentMatchCooldown.get(key);
  if (!last) return false;
  if (Date.now() - last < COOLDOWN_MS) return true;
  recentMatchCooldown.delete(key);
  return false;
}

function setCooldown(cameraId: number, employeeId: number) {
  recentMatchCooldown.set(`${cameraId}:${employeeId}`, Date.now());
}

function toVector(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

async function resolveCameraByGateway(gatewayId: string | null) {
  if (!gatewayId?.trim()) return null;
  const key = gatewayId.trim();
  const numericId = Number(key);

  const result = await pool.query(
    `
    SELECT id, camera_name, location_id, camera_code
    FROM cameras
    WHERE (
      ($1::int IS NOT NULL AND id = $1::int)
      OR LOWER(camera_name) = LOWER($2)
      OR LOWER(COALESCE(camera_code, '')) = LOWER($2)
    )
    LIMIT 1
    `,
    [Number.isInteger(numericId) ? numericId : null, key]
  );

  return result.rows[0] || null;
}

export async function GET(request: NextRequest) {
  try {
    const serviceRequest = isAIServiceRequest(request);
    if (!serviceRequest) {
      const user = await getAuthUser(request);
      if (!user) return unauthorizedResponse();
      if (!canViewCameras(user.role)) return forbiddenResponse();
    }

    const cameraIdRaw = request.nextUrl.searchParams.get("camera_id");
    const cameraId = cameraIdRaw ? Number(cameraIdRaw) : undefined;
    const limit = Number(request.nextUrl.searchParams.get("limit") || 12);

    if (request.nextUrl.searchParams.get("cameras") === "1") {
      const cameras = await listGateCameras();
      return NextResponse.json({ success: true, data: cameras });
    }

    const data = listRecentGateScans(
      Number.isInteger(cameraId) ? cameraId : undefined,
      Math.min(Math.max(limit, 1), 50)
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  const startedAtMs = performance.now();
  try {
    const serviceRequest = isAIServiceRequest(request);
    if (!serviceRequest) {
      const user = await getAuthUser(request);
      if (!user) return unauthorizedResponse();
      if (!canViewCameras(user.role)) return forbiddenResponse();
    }

    let cameraId: number | undefined;
    let faceMatrixEncoding: number[] | undefined;
    let gatewayId: string | null = null;
    try {
      const body = await request.json();
      if (body?.camera_id) cameraId = Number(body.camera_id);
      if (body?.gateway_id) gatewayId = String(body.gateway_id);
      if (body?.face_matrix_encoding) {
        faceMatrixEncoding = toVector(body.face_matrix_encoding);
      }
    } catch {
      cameraId = undefined;
    }

    if (faceMatrixEncoding && faceMatrixEncoding.length > 0) {
      const camera =
        (Number.isInteger(cameraId)
          ? await resolveCameraByGateway(String(cameraId))
          : null) || (await resolveCameraByGateway(gatewayId));

      if (!camera) {
        return NextResponse.json(
          {
            success: false,
            message: "Camera not found for gateway_id",
          },
          { status: 400 }
        );
      }

      const locationId =
        camera.location_id == null ? null : Number(camera.location_id);
      const [employees, aiSettings] = await Promise.all([
        getEmployeeEncodingCache(),
        getAIRecognitionSettings(),
      ]);
      const match = matchEmployeeFromEncoding(faceMatrixEncoding, employees, {
        minConfidence: aiSettings.confidenceThreshold,
      });
      const eventTime = nowIsoInTimezone();

      if (!match.matched) {
        await ingestFaceEvent({
          camera_id: Number(camera.id),
          location_id: locationId,
          event_time: eventTime,
          confidence: match.confidence,
          event_type: "FACE_DETECTED",
          metadata: { source: "python_rtsp_encoding", gateway_id: gatewayId },
          create_attendance_log: false,
        }).catch(() => {});

        return successResponse(
          {
            camera_id: Number(camera.id),
            camera_name: String(camera.camera_name || ""),
            at: eventTime,
            face_detected: true,
            matched: false,
            marked: false,
            confidence: match.confidence,
            message: "Face detected — not a registered employee",
          },
          startedAtMs
        );
      }

      const employee = match.employee;

      if (!(await employeeCanBeFaceScanned(employee.employee_id))) {
        return successResponse(
          {
            camera_id: Number(camera.id),
            camera_name: String(camera.camera_name || ""),
            at: eventTime,
            face_detected: true,
            matched: true,
            marked: false,
            skipped: true,
            skip_reason: "no_face_registered",
            employee_id: employee.employee_id,
            employee_name: employee.employee_name,
            employee_code: employee.employee_code,
            department: employee.department,
            confidence: match.confidence,
            message: `${employee.employee_name || "Employee"} has no registered face — use Face Registration or manual check-in`,
          },
          startedAtMs
        );
      }

      if (isOnCooldown(Number(camera.id), employee.employee_id)) {
        return successResponse(
          {
            camera_id: Number(camera.id),
            camera_name: String(camera.camera_name || ""),
            at: eventTime,
            face_detected: true,
            matched: true,
            marked: false,
            skipped: true,
            skip_reason: "cooldown",
            employee_id: employee.employee_id,
            employee_name: employee.employee_name,
            employee_code: employee.employee_code,
            department: employee.department,
            confidence: match.confidence,
            message: `${employee.employee_name || "Employee"} already marked recently`,
          },
          startedAtMs
        );
      }

      const { attendance, skipped, skipReason } =
        await ingestFaceEventAndMarkAttendance({
          camera_id: Number(camera.id),
          employee_id: employee.employee_id,
          location_id: locationId,
          event_time: eventTime,
          confidence: match.confidence,
          event_type: "FACE_RECOGNIZED",
          metadata: {
            source: "python_rtsp_encoding",
            gateway_id: gatewayId,
            employee_name: employee.employee_name,
            employee_code: employee.employee_code,
          },
          create_attendance_log: false,
        });

      if (attendance) {
        setCooldown(Number(camera.id), employee.employee_id);
        return successResponse(
          {
            camera_id: Number(camera.id),
            camera_name: String(camera.camera_name || ""),
            at: eventTime,
            face_detected: true,
            matched: true,
            marked: true,
            employee_id: attendance.employee_id,
            employee_name: attendance.employee_name,
            employee_code: attendance.employee_code,
            department: attendance.department,
            confidence: attendance.confidence,
            action: attendance.action,
            attendance_status: attendance.attendance_status,
            event_time: attendance.event_time,
            late_minutes: attendance.late_minutes,
            message: `${attendance.action} · ${attendance.attendance_status || "Marked"} · ${attendance.employee_name}`,
          },
          startedAtMs
        );
      }

      if (skipped) {
        setCooldown(Number(camera.id), employee.employee_id);
        return successResponse(
          {
            camera_id: Number(camera.id),
            camera_name: String(camera.camera_name || ""),
            at: eventTime,
            face_detected: true,
            matched: true,
            marked: false,
            skipped: true,
            skip_reason: skipReason,
            employee_id: employee.employee_id,
            employee_name: employee.employee_name,
            employee_code: employee.employee_code,
            department: employee.department,
            confidence: match.confidence,
            message: `${employee.employee_name || "Employee"}: ${skipReason || "Skipped"}`,
          },
          startedAtMs
        );
      }

      return successResponse(
        {
          camera_id: Number(camera.id),
          camera_name: String(camera.camera_name || ""),
          at: eventTime,
          face_detected: true,
          matched: true,
          marked: false,
          employee_id: employee.employee_id,
          employee_name: employee.employee_name,
          employee_code: employee.employee_code,
          department: employee.department,
          confidence: match.confidence,
          message: "Matched but attendance was not updated",
        },
        startedAtMs
      );
    }

    const result = Number.isInteger(cameraId)
      ? await scanCameraForGateAttendance(cameraId as number)
      : await scanNextGateCamera();

    if (!result) {
      const processingMs = Math.round(performance.now() - startedAtMs);
      observeLatency(processingMs);
      const response = NextResponse.json({
        success: true,
        data: null,
        message: "No gate cameras configured",
        processing_ms: processingMs,
      });
      response.headers.set("X-Processing-Ms", String(processingMs));
      return response;
    }

    return successResponse(result, startedAtMs);
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
