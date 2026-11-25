import { NextRequest, NextResponse } from "next/server";

import { UserRole } from "@/types/roles";

import {

  getAuthUser,

  unauthorizedResponse,

  forbiddenResponse,

} from "@/utils/api-auth";

import { canViewCameras } from "@/utils/permissions";

import { getCameraById } from "@/services/camera.service";

import { captureCameraFrame } from "@/services/camera-frame-capture.service";

import { getCameraStreamSecrets } from "@/services/camera-stream-credentials.service";

import { captureHttpSnapshot } from "@/services/camera-node-capture.service";

import { formatProbeErrorCode } from "@/utils/camera-probe-errors";

import { isRtspCamera } from "@/utils/camera-stream";

import { isJpegBuffer } from "@/utils/cp-plus-http";



export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export const maxDuration = 300;



interface RouteContext {

  params: Promise<{ id: string }>;

}



function parseId(id: string) {

  const numeric = Number(id);

  return Number.isNaN(numeric) ? null : numeric;

}



async function loadCamera(request: NextRequest, context: RouteContext) {

  const user = await getAuthUser(request);

  if (!user) return { error: unauthorizedResponse() };



  if (!canViewCameras(user.role)) {

    return { error: forbiddenResponse() };

  }



  const { id } = await context.params;

  const cameraId = parseId(id);



  if (cameraId === null) {

    return {

      error: NextResponse.json(

        { success: false, message: "Invalid camera ID" },

        { status: 400 }

      ),

    };

  }



  const managerLocationId =

    user.role === UserRole.MANAGER ? user.location_id : null;



  const camera = await getCameraById(cameraId, managerLocationId);



  if (!camera) {

    return {

      error: NextResponse.json(

        { success: false, message: "Camera not found" },

        { status: 404 }

      ),

    };

  }

  if (camera.status === "INACTIVE") {

    return {

      error: NextResponse.json(

        {

          success: false,

          message: "Camera is disabled",

          error_code: "CAMERA_DISABLED",

        },

        { status: 403 }

      ),

    };

  }



  return { camera, cameraId };

}



export async function GET(

  request: NextRequest,

  context: RouteContext

) {

  const loaded = await loadCamera(request, context);

  if ("error" in loaded && loaded.error) return loaded.error;

  const { camera, cameraId } = loaded as {

    camera: NonNullable<Awaited<ReturnType<typeof getCameraById>>>;

    cameraId: number;

  };



  const mode = request.nextUrl.searchParams.get("mode") || "snapshot";

  const streamInput = {

    camera_ip: camera.camera_ip,

    port: camera.port,

    rtsp_url: camera.rtsp_url,

  };



  if (!isRtspCamera(streamInput)) {

    return NextResponse.json(

      {

        success: false,

        message: "Invalid RTSP URL — configure camera IP and RTSP port",

        error_code: "INVALID_RTSP_URL",

      },

      { status: 422 }

    );

  }



  if (mode === "snapshot") {
    const previewParam = request.nextUrl.searchParams.get("preview");
    const preview = previewParam === "1";
    const frame = await captureCameraFrame(cameraId, { preview });

    if (frame && isJpegBuffer(frame)) {

      return new NextResponse(new Uint8Array(frame), {

        status: 200,

        headers: {

          "Content-Type": "image/jpeg",

          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",

          Pragma: "no-cache",

        },

      });

    }



    const secrets = await getCameraStreamSecrets(cameraId);

    let errorCode = "NO_FRAMES_RECEIVED";

    let message = formatProbeErrorCode(errorCode);



    if (!secrets?.camera_ip) {

      errorCode = "INVALID_RTSP_URL";

      message = formatProbeErrorCode(errorCode);

    } else if (!secrets.rtsp_password) {

      errorCode = "RTSP_AUTHENTICATION_FAILED";

      message = formatProbeErrorCode(errorCode);

    } else {

      const httpFrame = await captureHttpSnapshot({

        camera_ip: secrets.camera_ip,

        http_port: secrets.http_port,

        port: secrets.port,

        rtsp_channel: secrets.rtsp_channel,

        rtsp_subtype: secrets.rtsp_subtype,

        rtsp_username: secrets.rtsp_username,

        rtsp_password: secrets.rtsp_password,

        brand: secrets.brand ?? "CP Plus",

      });



      if (httpFrame) {

        return new NextResponse(new Uint8Array(httpFrame), {

          status: 200,

          headers: {

            "Content-Type": "image/jpeg",

            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",

            Pragma: "no-cache",

          },

        });

      }

    }



    return NextResponse.json(

      {

        success: false,

        message,

        error_code: errorCode,

      },

      {

        status: 502,

        headers: { "Cache-Control": "no-store" },

      }

    );

  }



  return NextResponse.json(

    {

      success: false,

      message: "Use snapshot mode for RTSP cameras",

      error_code: "INVALID_RTSP_URL",

    },

    { status: 422 }

  );

}


