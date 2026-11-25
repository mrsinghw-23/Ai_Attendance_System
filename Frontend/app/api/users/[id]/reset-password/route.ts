import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageUsers } from "@/utils/permissions";
import { resetPasswordSchema } from "@/schemas/admin.schema";
import {
  getUserAccountById,
  setUserPassword,
} from "@/services/user.service";
import { writeAuditLog } from "@/services/audit.service";
import { writeLoginHistory } from "@/services/login-history.service";
import { generateTemporaryPassword } from "@/utils/password";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const targetId = Number(id);
    if (Number.isNaN(targetId)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message || "Invalid reset payload",
        },
        { status: 400 }
      );
    }

    const existing = await getUserAccountById(targetId);
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const newPassword =
      parsed.data.generateTemporary || !parsed.data.newPassword
        ? generateTemporaryPassword()
        : parsed.data.newPassword;

    const updated = await setUserPassword(
      targetId,
      newPassword,
      parsed.data.requireChange
    );

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "PASSWORD_RESET",
      entityType: "user",
      entityId: targetId,
      metadata: { requireChange: parsed.data.requireChange },
      request,
    });

    await writeLoginHistory({
      userId: targetId,
      username: existing.username,
      eventType: "PASSWORD_RESET",
      status: "SUCCESS",
      request,
      metadata: { source: "admin_reset" },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      temporaryPassword: newPassword,
      message: "Your password has been reset.",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
