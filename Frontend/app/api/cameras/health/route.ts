import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import {
  canManageCameras,
  canViewCameras,
} from "@/utils/permissions";
import {
  getCameraHealthLogs,
  runCameraHealthCheck,
} from "@/services/camera-health.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const cameraId = request.nextUrl.searchParams.get("camera_id");
    const data = await getCameraHealthLogs(
      cameraId ? Number(cameraId) : undefined
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageCameras(user.role)) return forbiddenResponse();

    const data = await runCameraHealthCheck();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
