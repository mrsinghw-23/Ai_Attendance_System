import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewAttendance } from "@/utils/permissions";
import { listLiveAttendanceEvents } from "@/services/attendance-live.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) return forbiddenResponse();

    const limit = Number(request.nextUrl.searchParams.get("limit") || 15);
    const data = await listLiveAttendanceEvents(
      Number.isFinite(limit) ? Math.min(limit, 50) : 15
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
