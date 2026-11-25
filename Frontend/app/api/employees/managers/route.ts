import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageEmployees } from "@/utils/permissions";
import { getManagerOptions } from "@/services/employee.service";

export async function GET(
  request: NextRequest
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canManageEmployees(user.role)) {
      return forbiddenResponse();
    }

    const { searchParams } =
      request.nextUrl;
    const locationId = searchParams.get(
      "location_id"
    );

    const managerLocationId =
      user.role === UserRole.MANAGER
        ? user.location_id
        : locationId
          ? Number(locationId)
          : null;

    const managers = await getManagerOptions(
      managerLocationId
    );

    return NextResponse.json({
      success: true,
      data: managers,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
