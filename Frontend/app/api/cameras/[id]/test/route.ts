import { NextRequest, NextResponse } from "next/server";

import {

  getAuthUser,

  unauthorizedResponse,

  forbiddenResponse,

  serverErrorResponse,

} from "@/utils/api-auth";

import { canManageCameras, canViewCameras } from "@/utils/permissions";

import { formatProbeErrorCode } from "@/utils/camera-probe-errors";

import {

  probeCameraById,

  probeCameraConfig,

} from "@/services/camera-probe.service";

import { getCameraStreamSecrets } from "@/services/camera-stream-credentials.service";

import { probeCameraSchema } from "@/schemas/camera.schema";

import {

  getCameraById,

  saveCameraDiagnostics,

} from "@/services/camera.service";

import pool from "@/lib/db";

import { createCameraEvent } from "@/services/camera-event.service";

import { publishRealtimeEvent } from "@/services/realtime.service";



export const dynamic = "force-dynamic";



interface RouteContext {

  params: Promise<{ id: string }>;

}



export async function POST(

  request: NextRequest,

  context: RouteContext

) {

  try {

    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();

    if (!canViewCameras(user.role)) return forbiddenResponse();



    const { id } = await context.params;

    const cameraId = Number(id);

    if (!Number.isInteger(cameraId) || cameraId <= 0) {

      return NextResponse.json(

        { success: false, message: "Invalid camera ID" },

        { status: 400 }

      );

    }



    const camera = await getCameraById(cameraId);

    if (!camera) {

      return NextResponse.json(

        { success: false, message: "Camera not found" },

        { status: 404 }

      );

    }



    const rawBody = await request.json().catch(() => null);

    let diagnostics;



    if (rawBody && typeof rawBody === "object" && rawBody.camera_ip) {

      const parsed = probeCameraSchema.safeParse(rawBody);

      if (!parsed.success) {

        return NextResponse.json(

          {

            success: false,

            message: parsed.error.issues[0]?.message || "Invalid probe data",

          },

          { status: 400 }

        );

      }



      const stored = await getCameraStreamSecrets(cameraId);

      const password =

        parsed.data.rtsp_password?.trim() ||

        stored?.rtsp_password ||

        "";



      if (!password && !parsed.data.rtsp_direct_url?.trim()) {

        return NextResponse.json(

          {

            success: false,

            message: "Enter RTSP password or paste Direct RTSP Link",

          },

          { status: 400 }

        );

      }



      diagnostics = await probeCameraConfig({

        ...parsed.data,

        rtsp_password: password,

      });

      diagnostics.camera_id = cameraId;

      diagnostics.camera_name = camera.camera_name;

    } else {

      diagnostics = await probeCameraById(cameraId);

    }



    let databaseOk = false;

    try {

      await pool.query("SELECT 1");

      databaseOk = true;

    } catch {

      databaseOk = false;

    }



    const enriched = {

      ...diagnostics,

      checked_at: new Date().toISOString(),

      opencv_ok: diagnostics.frame_captured,

      python_service_ok:

        diagnostics.frame_captured || diagnostics.rtsp_connected,

      database_ok: databaseOk,

      attendance_engine_ok: databaseOk,

      camera_id: cameraId,

      camera_name: camera.camera_name,

      message: diagnostics.frame_captured

        ? "Camera test passed — live stream ready"

        : formatProbeErrorCode(diagnostics.error_code),

    };



    if (canManageCameras(user.role)) {

      await saveCameraDiagnostics(cameraId, enriched);



      await pool.query(

        `

        INSERT INTO camera_health_logs (

          camera_id, health_status, latency_ms,

          camera_reachable, rtsp_reachable, stream_available, message, diagnostics

        )

        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)

        `,

        [

          cameraId,

          enriched.health_status,

          enriched.latency_ms,

          enriched.camera_reachable,

          enriched.rtsp_connected,

          enriched.frame_captured,

          enriched.message,

          JSON.stringify(enriched),

        ]

      );



      if (enriched.frame_captured) {

        await createCameraEvent({

          cameraId,

          eventType: "CAMERA_ONLINE",

          message: `${camera.camera_name} passed connection test`,

        });

      } else {

        await createCameraEvent({

          cameraId,

          eventType: "STREAM_ERROR",

          message: enriched.message || "Camera test failed",

          notify: true,

        });

      }



      publishRealtimeEvent("camera.health", {

        cameraId,

        cameraName: camera.camera_name,

        healthStatus: enriched.health_status,

        message: enriched.message,

        diagnostics: enriched,

      });

    }



    return NextResponse.json({

      success: Boolean(diagnostics.frame_captured),

      data: enriched,

      message: enriched.message,

    });

  } catch (error) {

    console.error(error);

    return serverErrorResponse();

  }

}


