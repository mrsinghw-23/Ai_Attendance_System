import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewFaceRegistration } from "@/utils/permissions";
import { getFaceRegistrationStats } from "@/services/face-registration.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewFaceRegistration(user.role)) {
      return forbiddenResponse();
    }

    const managerLocationId =
      user.role === UserRole.MANAGER ? user.location_id : null;

    const data = await getFaceRegistrationStats(managerLocationId);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
