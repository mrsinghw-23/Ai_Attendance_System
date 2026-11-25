import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewAttendance } from "@/utils/permissions";
import {
  getCameraEngineDashboard,
  getEmployeeEngineDashboard,
  getLocationEngineDashboard,
} from "@/services/attendance-engine.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) return forbiddenResponse();

    const type = request.nextUrl.searchParams.get("type") || "employee";
    const date = request.nextUrl.searchParams.get("date") || undefined;

    let data;
    switch (type) {
      case "camera":
        data = await getCameraEngineDashboard(date);
        break;
      case "location":
        data = await getLocationEngineDashboard(date);
        break;
      default:
        data = await getEmployeeEngineDashboard(date);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
