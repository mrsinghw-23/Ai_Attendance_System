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
import { deleteAllUnknownFaces } from "@/services/ai-recognition.service";

const bodySchema = z.object({
  action: z.enum(["delete_all"]),
  scope: z.enum(["today", "all"]).optional(),
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
    const scope = parsed.data.scope ?? "all";
    const result = await deleteAllUnknownFaces({ locationId, scope });

    return NextResponse.json({
      success: true,
      data: result,
      message:
        scope === "today"
          ? `Deleted ${result.deleted} unknown face record(s) for today.`
          : `Deleted ${result.deleted} unknown face record(s).`,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
