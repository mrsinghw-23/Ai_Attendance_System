import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { getDashboardDetails } from "@/services/dashboard.service";
import { DashboardDetailType } from "@/types/dashboard";

const VALID_TYPES: DashboardDetailType[] = [
  "total_employees",
  "present",
  "late",
  "absent",
  "half_day",
  "cameras",
  "users_all",
  "users_active",
  "users_disabled",
  "faces_detected",
  "faces_recognized",
  "attendance_generated",
  "recent_activity",
  "face_registered",
  "face_pending",
  "face_partial",
  "locations_overview",
];

function isDetailType(value: string): value is DashboardDetailType {
  return VALID_TYPES.includes(value as DashboardDetailType);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const type = request.nextUrl.searchParams.get("type") || "";
    if (!isDetailType(type)) {
      return NextResponse.json(
        { success: false, message: "Invalid detail type" },
        { status: 400 }
      );
    }

    if (
      type.startsWith("users_") &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 }
      );
    }

    const managerLocationId =
      user.role === UserRole.MANAGER ? user.location_id : null;

    const data = await getDashboardDetails(type, { managerLocationId });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
