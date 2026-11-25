import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewCameras } from "@/utils/permissions";
import {
  getCameraStats,
  getLocationCameraReport,
} from "@/services/camera.service";

export async function GET(
  request: NextRequest
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canViewCameras(user.role)) {
      return forbiddenResponse();
    }

    const managerLocationId =
      user.role === UserRole.MANAGER
        ? user.location_id
        : null;

    const [stats, locationReport] =
      await Promise.all([
        getCameraStats(managerLocationId),
        getLocationCameraReport(
          managerLocationId
        ),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        locationReport,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
