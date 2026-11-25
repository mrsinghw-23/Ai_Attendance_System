import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewAttendance } from "@/utils/permissions";
import { getAttendanceSummaries } from "@/services/attendance-engine.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) return forbiddenResponse();

    const params = request.nextUrl.searchParams;
    const summaries = await getAttendanceSummaries({
      date: params.get("date") || undefined,
      locationId: params.get("location_id")
        ? Number(params.get("location_id"))
        : undefined,
      employeeId: params.get("employee_id")
        ? Number(params.get("employee_id"))
        : undefined,
      status: params.get("status") || undefined,
    });

    return NextResponse.json({ success: true, data: summaries });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
