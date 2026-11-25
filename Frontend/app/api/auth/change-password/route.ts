import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { changePasswordSchema } from "@/schemas/admin.schema";
import {
  setUserPassword,
  verifyCurrentPassword,
} from "@/services/user.service";
import { writeAuditLog } from "@/services/audit.service";
import { writeLoginHistory } from "@/services/login-history.service";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const parsed = changePasswordSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message || "Invalid password payload",
        },
        { status: 400 }
      );
    }

    const valid = await verifyCurrentPassword(
      user.id,
      parsed.data.currentPassword
    );

    if (!valid) {
      await writeAuditLog({
        userId: user.id,
        username: user.username,
        action: "PASSWORD_CHANGE_FAILED",
        entityType: "user",
        entityId: user.id,
        metadata: { reason: "invalid_current_password" },
        request,
      });

      return NextResponse.json(
        {
          success: false,
          message: "Current password is incorrect",
        },
        { status: 400 }
      );
    }

    await setUserPassword(user.id, parsed.data.newPassword, false);
    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "PASSWORD_CHANGED",
      entityType: "user",
      entityId: user.id,
      request,
    });
    await writeLoginHistory({
      userId: user.id,
      username: user.username,
      eventType: "PASSWORD_CHANGE",
      status: "SUCCESS",
      request,
    });

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
