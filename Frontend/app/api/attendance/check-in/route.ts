import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewAttendance } from "@/utils/permissions";
import { attendanceEventSchema } from "@/schemas/attendance.schema";
import { checkIn } from "@/services/attendance.service";
import { getEmployeeById } from "@/services/employee.service";

async function canWriteForEmployee(
  user: {
    role: string;
    location_id: number | null;
    employee_id: number | null;
  },
  employeeId: number
) {
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if (user.role === UserRole.EMPLOYEE) {
    return user.employee_id === employeeId;
  }
  if (user.role === UserRole.MANAGER) {
    return !!(await getEmployeeById(employeeId, user.location_id));
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) {
      return forbiddenResponse();
    }

    const parsed = attendanceEventSchema.safeParse(
      await request.json()
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            "Invalid check-in payload",
        },
        { status: 400 }
      );
    }

    if (
      !(await canWriteForEmployee(
        user,
        parsed.data.employee_id
      ))
    ) {
      return forbiddenResponse();
    }

    const record = await checkIn({
      employeeId: parsed.data.employee_id,
      eventTime: parsed.data.event_time,
      source: parsed.data.source,
      cameraId: parsed.data.camera_id,
    });

    if (!record) {
      return NextResponse.json(
        {
          success: false,
          message: "Employee not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: record,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
