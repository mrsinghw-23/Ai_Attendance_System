import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
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
import { getCameraEvents, recordMotionEvent } from "@/services/camera-event.service";
import { CameraEventType } from "@/types/camera";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const { searchParams } = request.nextUrl;
    const cameraId = searchParams.get("camera_id");
    const eventType = searchParams.get("event_type") as CameraEventType | null;
    const limit = searchParams.get("limit");

    const events = await getCameraEvents({
      cameraId: cameraId ? Number(cameraId) : undefined,
      eventType: eventType || undefined,
      limit: limit ? Number(limit) : 50,
      managerLocationId:
        user.role === UserRole.MANAGER ? user.location_id : null,
    });

    return NextResponse.json({ success: true, data: events });
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

    const body = await request.json();
    const cameraId = Number(body.camera_id);

    if (!cameraId) {
      return NextResponse.json(
        { success: false, message: "camera_id is required" },
        { status: 400 }
      );
    }

    const event = await recordMotionEvent(
      cameraId,
      body.message || "Manual motion event recorded"
    );

    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
