import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageAttendance } from "@/utils/permissions";
import { UserRole } from "@/types/roles";
import { deleteAllTodayAttendanceLogs } from "@/services/attendance-cleanup.service";

const bodySchema = z.object({
  action: z.enum(["delete_all"]),
  aiOnly: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageAttendance(user.role, user.permissions)) {
      return forbiddenResponse();
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid request" },
        { status: 400 }
      );
    }

    const locationId =
      user.role === UserRole.MANAGER ? user.location_id : null;
    const result = await deleteAllTodayAttendanceLogs({
      aiOnly: parsed.data.aiOnly,
      locationId,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Deleted ${result.deleted} attendance log(s) for today.`,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
