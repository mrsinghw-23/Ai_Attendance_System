import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canDeleteRecords, canManageAttendance } from "@/utils/permissions";
import { deleteAttendanceRecord } from "@/services/attendance.service";
import { writeAuditLog } from "@/services/audit.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        { success: false, message: "Invalid attendance record id" },
        { status: 400 }
      );
    }

    const scope =
      user.role === UserRole.MANAGER
        ? { managerLocationId: user.location_id }
        : user.role === UserRole.EMPLOYEE
          ? { employeeId: user.employee_id }
          : {};

    const result = await deleteAttendanceRecord(id, scope);

    if (!result.deleted) {
      if (result.reason === "NOT_FOUND") {
        return NextResponse.json(
          { success: false, message: "Attendance record not found" },
          { status: 404 }
        );
      }
      return forbiddenResponse();
    }

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "ATTENDANCE_DELETED",
      entityType: "attendance_record",
      entityId: String(id),
      metadata: {
        employee_id: result.record?.employee_id,
        attendance_date: result.record?.attendance_date,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      message: "Attendance record deleted",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
