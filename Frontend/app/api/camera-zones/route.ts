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
import { createCameraZoneSchema } from "@/schemas/camera.schema";
import {
  createCameraZone,
  getCameraZones,
} from "@/services/camera-zone.service";

function managerScope(role: string, locationId: number | null) {
  return role === UserRole.MANAGER ? locationId : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const locationId = request.nextUrl.searchParams.get("location_id");

    const zones = await getCameraZones({
      locationId: locationId ? Number(locationId) : undefined,
      managerLocationId: managerScope(user.role, user.location_id),
    });

    return NextResponse.json({ success: true, data: zones });
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
    const parsed = createCameraZoneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Validation failed",
        },
        { status: 400 }
      );
    }

    const zone = await createCameraZone(parsed.data);
    return NextResponse.json({ success: true, data: zone }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
