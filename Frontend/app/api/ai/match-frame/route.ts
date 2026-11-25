import { NextRequest, NextResponse } from "next/server";

import {

  getAuthUser,

  unauthorizedResponse,

  forbiddenResponse,

  serverErrorResponse,

} from "@/utils/api-auth";

import { canViewCameras } from "@/utils/permissions";

import { matchFaceFromBuffer } from "@/services/live-face-match.service";

import { ingestFaceEventAndMarkAttendance } from "@/services/attendance-live.service";

import { countScannableEmployees, employeeCanBeFaceScanned } from "@/services/employee-encoding-cache.service";

import {
  dateOnly,
  getAttendanceEngineConfig,
  isCheckOutWindow,
  isWithinCheckInWindow,
} from "@/services/attendance-settings.service";

import { employeeHasCheckInToday } from "@/services/attendance-engine.service";

import { nowIsoInTimezone } from "@/utils/timezone";

import pool from "@/lib/db";

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



export const dynamic = "force-dynamic";

function buildMatchedSkipResponse(
  match: {
    employee_id: number;
    employee_name?: string | null;
    employee_code?: string | null;
    confidence?: number | null;
  },
  message: string,
  skipReason: string,
  eventTime: string
) {
  return NextResponse.json({
    success: true,
    matched: true,
    skipped: true,
    skip_reason: skipReason,
    message,
    face_detected: true,
    employee_id: match.employee_id,
    data: {
      employee_id: match.employee_id,
      employee_name: match.employee_name,
      employee_code: match.employee_code,
      confidence: match.confidence ?? 0,
      action: "PRESENT" as const,
      late_minutes: 0,
      event_time: eventTime,
    },
  });
}

export async function POST(request: NextRequest) {

  try {

    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();

    if (!canViewCameras(user.role)) return forbiddenResponse();



    const formData = await request.formData();

    const file = formData.get("image");

    const source = String(formData.get("source") || "");

    const isWebcam = source === "webcam";

    const branchName = String(formData.get("branch_name") || "").trim();

    const entrance = String(formData.get("entrance") || "").trim();

    const displayName = String(formData.get("display_name") || "").trim();

    const entryExitType = String(formData.get("entry_exit_type") || "").trim();

    const cameraIdRaw = formData.get("camera_id");

    const cameraId =

      cameraIdRaw != null && String(cameraIdRaw).trim() !== ""

        ? Number(cameraIdRaw)

        : null;

    const locationIdRaw = formData.get("location_id");

    const locationId = locationIdRaw ? Number(locationIdRaw) : null;



    if (!(file instanceof File)) {

      return NextResponse.json(

        { success: false, message: "Image is required" },

        { status: 400 }

      );

    }



    if (!isWebcam) {

      if (!Number.isInteger(cameraId) || !cameraId || cameraId <= 0) {

        return NextResponse.json(

          { success: false, message: "Valid camera_id is required" },

          { status: 400 }

        );

      }



      const cameraStatusRow = await pool.query(

        `SELECT COALESCE(status, 'ACTIVE') AS status FROM cameras WHERE id = $1`,

        [cameraId]

      );

      if (!cameraStatusRow.rows[0]) {

        return NextResponse.json(

          { success: false, message: "Camera not found" },

          { status: 404 }

        );

      }

      if (cameraStatusRow.rows[0].status === "INACTIVE") {

        return NextResponse.json(

          { success: false, message: "Camera is disabled" },

          { status: 403 }

        );

      }

    } else if (Number.isInteger(cameraId) && cameraId && cameraId > 0) {

      const cameraStatusRow = await pool.query(

        `SELECT COALESCE(status, 'ACTIVE') AS status FROM cameras WHERE id = $1`,

        [cameraId]

      );

      if (

        cameraStatusRow.rows[0] &&

        cameraStatusRow.rows[0].status === "INACTIVE"

      ) {

        return NextResponse.json(

          { success: false, message: "Linked camera is disabled" },

          { status: 403 }

        );

      }

    }



    const buffer = Buffer.from(await file.arrayBuffer());

    const scannableEmployees = await countScannableEmployees();
    if (scannableEmployees === 0) {
      return NextResponse.json(
        {
          success: false,
          matched: false,
          face_detected: true,
          message:
            "No employee face embeddings in database. Register faces and run: python main.py --sync-embeddings",
        },
        { status: 503 }
      );
    }

    const match = await matchFaceFromBuffer(buffer);



    const cooldownScope = isWebcam

      ? cameraId && cameraId > 0

        ? `webcam:${cameraId}`

        : "webcam"

      : (cameraId as number);



    let resolvedLocationId = Number.isInteger(locationId) ? locationId : null;



    if (!resolvedLocationId && Number.isInteger(cameraId) && cameraId && cameraId > 0) {

      const cameraRow = await pool.query(

        `SELECT location_id FROM cameras WHERE id = $1`,

        [cameraId]

      );

      resolvedLocationId = cameraRow.rows[0]?.location_id ?? null;

    }



    if (!match.matched || !match.employee_id) {

      if (match.face_detected) {
        const unknownSource = isWebcam ? "pc_webcam" : "live_web_scan";
        const persistUnknown = await shouldPersistUnknownFace(unknownSource);

        if (persistUnknown) {
        const unknownCooldownMs = await getUnknownFaceCooldownMs();

        if (!isUnknownFaceOnCooldown(cooldownScope, unknownCooldownMs)) {

          try {

            const imagePath = await saveUnknownFaceImage(buffer, cooldownScope);

            await recordUnknownFace({

              cameraId:

                Number.isInteger(cameraId) && cameraId && cameraId > 0

                  ? cameraId

                  : null,

              locationId: resolvedLocationId,

              imagePath,

              confidence: match.confidence ?? null,

              metadata: {

                source: unknownSource,

                branch_name: branchName || undefined,

                entrance: entrance || undefined,

                display_name: displayName || undefined,

              },

            });

            markUnknownFaceCooldown(cooldownScope);

          } catch (error) {

            console.error("Failed to save unknown face:", error);

          }

        }
        }
      }

      return NextResponse.json({

        success: true,

        matched: false,

        face_detected: Boolean(match.face_detected),

        message: match.error || "No matching employee",

        confidence: match.confidence ?? null,

      });

    }

    const matchedResult = { ...match, employee_id: match.employee_id };

    const eventTime = nowIsoInTimezone();

    if (!(await employeeCanBeFaceScanned(match.employee_id))) {
      return buildMatchedSkipResponse(
        matchedResult,
        `${match.employee_name || "Employee"} has no registered face — complete Face Registration first, or use manual check-in on the Attendance page`,
        "no_face_registered",
        eventTime
      );
    }

    const cooldownMs = await getRecognitionCooldownMs();
    const eventDate = new Date(eventTime);
    const attendanceDate = dateOnly(eventDate);
    const config = await getAttendanceEngineConfig();
    const alreadyCheckedIn = await employeeHasCheckInToday(
      match.employee_id,
      attendanceDate
    );

    if (!alreadyCheckedIn && !isWithinCheckInWindow(eventDate, config)) {
      markRecognitionCooldown(cooldownScope, match.employee_id);
      return buildMatchedSkipResponse(
        matchedResult,
        "Outside shift hours — attendance opens when working shift starts",
        "before_shift",
        eventTime
      );
    }

    if (isRecognitionOnCooldown(cooldownScope, match.employee_id, cooldownMs)) {
      return buildMatchedSkipResponse(
        matchedResult,
        "Already scanned recently",
        "recent_duplicate",
        eventTime
      );
    }

    const resolvedCameraId =

      Number.isInteger(cameraId) && cameraId && cameraId > 0 ? cameraId : null;



    const { attendance, skipped, skipReason, movementLogged, preview } =
      await ingestFaceEventAndMarkAttendance({

        camera_id: resolvedCameraId,

        employee_id: match.employee_id,

        location_id: resolvedLocationId,

        event_time: eventTime,

        confidence: match.confidence ?? null,

        event_type: "FACE_RECOGNIZED",

        metadata: {

          employee_name: match.employee_name,

          employee_code: match.employee_code,

          source: isWebcam ? "pc_webcam" : "live_web_scan",

          branch_name: branchName || undefined,

          entrance: entrance || undefined,

          display_name: displayName || undefined,

          entry_exit_type: entryExitType || undefined,

        },

        create_attendance_log: false,

      });



    const shouldCooldown =
      Boolean(attendance) ||
      skipReason === "movement_only" ||
      skipReason === "recent_duplicate";

    if (shouldCooldown) {
      markRecognitionCooldown(cooldownScope, match.employee_id);
    }

    if (skipped && !attendance) {
      const previewData = preview || {
        employee_id: match.employee_id,
        employee_name: match.employee_name,
        employee_code: match.employee_code,
        confidence: match.confidence ?? 0,
        action: "PRESENT" as const,
        late_minutes: 0,
        event_time: eventTime,
      };

      return NextResponse.json({
        success: true,
        matched: true,
        skipped: true,
        skip_reason: skipReason,
        movement_logged: Boolean(movementLogged),
        face_detected: true,
        data: previewData,
      });
    }



    return NextResponse.json({

      success: true,

      matched: true,

      marked: true,

      skipped: Boolean(skipped),

      skip_reason: skipReason,

      face_detected: true,

      data: attendance,

    });

  } catch (error) {

    console.error(error);

    return serverErrorResponse();

  }

}


