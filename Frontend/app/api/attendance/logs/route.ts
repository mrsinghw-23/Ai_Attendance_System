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
import {
  checkIn,
  checkOut,
  getAttendanceLogs,
} from "@/services/attendance.service";
import { getEmployeeById } from "@/services/employee.service";

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
    const employee = await getEmployeeById(
      employeeId,
      user.location_id
    );
    return !!employee;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) {
      return forbiddenResponse();
    }

    const logs = await getAttendanceLogs(
      scopeForUser(user)
    );

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

// AI-ready insertion point: future face recognition can call this endpoint
// with source = "AI_FACE_RECOGNITION" and a camera_id.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();
    if (!canViewAttendance(user.role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const parsed = attendanceEventSchema.safeParse(body);
    const eventType = body.event_type;

    if (!parsed.success || !["CHECK_IN", "CHECK_OUT"].includes(eventType)) {
      return NextResponse.json(
        {
          success: false,
          message: "Valid employee_id and event_type are required",
        },
        { status: 400 }
      );
    }

    const allowed = await canWriteForEmployee(
      user,
      parsed.data.employee_id
    );

    if (!allowed) return forbiddenResponse();

    const record =
      eventType === "CHECK_IN"
        ? await checkIn({
            employeeId: parsed.data.employee_id,
            eventTime: parsed.data.event_time,
            source: parsed.data.source,
            cameraId: parsed.data.camera_id,
          })
        : await checkOut({
            employeeId: parsed.data.employee_id,
            eventTime: parsed.data.event_time,
            source: parsed.data.source,
            cameraId: parsed.data.camera_id,
          });

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
