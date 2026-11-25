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
import {
  dedupeTodayFaceEvents,
  deleteAllTodayFaceEvents,
} from "@/services/face-events-cleanup.service";

const bodySchema = z.object({
  action: z.enum(["dedupe", "delete_all"]),
  scope: z.enum(["recognized", "detected"]).default("recognized"),
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
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Invalid request",
        },
        { status: 400 }
      );
    }

    const locationId =
      user.role === UserRole.MANAGER ? user.location_id : null;

    const result =
      parsed.data.action === "dedupe"
        ? await dedupeTodayFaceEvents({
            scope: parsed.data.scope,
            locationId,
          })
        : await deleteAllTodayFaceEvents({
            scope: parsed.data.scope,
            locationId,
          });

    return NextResponse.json({
      success: true,
      data: result,
      message:
        parsed.data.action === "dedupe"
          ? `Removed ${result.deleted} duplicate scan(s). Kept first scan per employee.`
          : `Deleted ${result.deleted} scan record(s) for today.`,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
