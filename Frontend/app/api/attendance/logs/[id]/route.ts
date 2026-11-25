import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canDeleteRecords, canManageAttendance } from "@/utils/permissions";
import { deleteAttendanceLog } from "@/services/attendance.service";
import { writeAuditLog } from "@/services/audit.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUserWithPermissions(request);
    if (!user) return unauthorizedResponse();
    if (!canDeleteRecords(user.role) && !canManageAttendance(user.role, user.permissions)) {
      return forbiddenResponse();
    }

    const { id: idParam } = await context.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid log id" },
        { status: 400 }
      );
    }

    const scope =
      user.role === UserRole.MANAGER
        ? { managerLocationId: user.location_id }
        : user.role === UserRole.EMPLOYEE
          ? { employeeId: user.employee_id }
          : {};

    const result = await deleteAttendanceLog(id, scope);

    if (!result.deleted) {
      if (result.reason === "NOT_FOUND") {
        return NextResponse.json(
          { success: false, message: "Attendance log not found" },
          { status: 404 }
        );
      }
      return forbiddenResponse();
    }

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "ATTENDANCE_LOG_DELETED",
      entityType: "attendance_log",
      entityId: String(id),
      request,
    });

    return NextResponse.json({
      success: true,
      message: "Attendance log deleted",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
