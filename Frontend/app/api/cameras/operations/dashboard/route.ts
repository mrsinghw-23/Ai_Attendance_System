import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewCameras } from "@/utils/permissions";
import { getCameraOperationsDashboard } from "@/services/camera-operations.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const managerLocationId =
      user.role === UserRole.MANAGER ? user.location_id : null;

    const data = await getCameraOperationsDashboard(managerLocationId);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
