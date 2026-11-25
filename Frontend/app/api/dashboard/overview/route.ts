import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { getDashboardOverview } from "@/services/dashboard.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const managerLocationId =
      user.role === UserRole.MANAGER ? user.location_id : null;

    const period = request.nextUrl.searchParams.get("period");
    const startDate = request.nextUrl.searchParams.get("start_date");
    const endDate = request.nextUrl.searchParams.get("end_date");

    const data = await getDashboardOverview({
      managerLocationId,
      period:
        period === "day" ||
        period === "week" ||
        period === "month" ||
        period === "custom"
          ? period
          : "week",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
