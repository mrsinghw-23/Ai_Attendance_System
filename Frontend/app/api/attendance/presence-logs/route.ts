import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewAttendance } from "@/utils/permissions";
import { getPresenceLogs } from "@/services/attendance-engine.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) return forbiddenResponse();

    const params = request.nextUrl.searchParams;
    const logs = await getPresenceLogs({
      employeeId: params.get("employee_id")
        ? Number(params.get("employee_id"))
        : undefined,
      date: params.get("date") || undefined,
      limit: params.get("limit")
        ? Number(params.get("limit"))
        : 100,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
