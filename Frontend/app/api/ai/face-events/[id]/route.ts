import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageAttendance } from "@/utils/permissions";
import { deleteFaceEventById } from "@/services/face-events-cleanup.service";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(_request);
    if (!user) return unauthorizedResponse();
    if (!canManageAttendance(user.role, user.permissions)) {
      return forbiddenResponse();
    }

    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid face event id" },
        { status: 400 }
      );
    }

    const deleted = await deleteFaceEventById(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "Face event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Scan record deleted",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
