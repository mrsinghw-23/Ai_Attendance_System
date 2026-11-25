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
  canDeleteRecords,
} from "@/utils/permissions";
import { updateCameraZoneSchema } from "@/schemas/camera.schema";
import {
  deleteCameraZone,
  getCameraZoneById,
  updateCameraZone,
} from "@/services/camera-zone.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(_request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const zone = await getCameraZoneById(Number(id));

    if (!zone) {
      return NextResponse.json(
        { success: false, message: "Zone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: zone });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageCameras(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateCameraZoneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Validation failed",
        },
        { status: 400 }
      );
    }

    const zone = await updateCameraZone(Number(id), parsed.data);

    if (!zone) {
      return NextResponse.json(
        { success: false, message: "Zone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: zone });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canDeleteRecords(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const deleted = await deleteCameraZone(Number(id));

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "Zone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Zone deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
