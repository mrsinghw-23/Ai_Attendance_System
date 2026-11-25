import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewAttendance } from "@/utils/permissions";
import { attendanceFiltersSchema } from "@/schemas/attendance.schema";
import { getAttendanceRecords } from "@/services/attendance.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function scopeForUser(user: {
  role: string;
  location_id: number | null;
  employee_id: number | null;
}) {
  if (user.role === UserRole.MANAGER) {
    return { managerLocationId: user.location_id };
  }

  if (user.role === UserRole.EMPLOYEE) {
    return { employeeId: user.employee_id };
  }

  return {};
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) {
      return forbiddenResponse();
    }

    const parsed = attendanceFiltersSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            "Invalid filters",
        },
        { status: 400 }
      );
    }

    const records = await getAttendanceRecords(
      parsed.data,
      scopeForUser(user)
    );

    return NextResponse.json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
