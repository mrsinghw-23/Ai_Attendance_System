import { NextRequest, NextResponse } from "next/server";
import { resetPasswordTokenSchema } from "@/schemas/admin.schema";
import { writeAuditLog } from "@/services/audit.service";
import { writeLoginHistory } from "@/services/login-history.service";
import {
  markTokenUsed,
  validateResetToken,
} from "@/services/password-reset.service";
import { setUserPassword } from "@/services/user.service";

export async function POST(request: NextRequest) {
  try {
    const parsed = resetPasswordTokenSchema.safeParse(
      await request.json()
    );

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

    const validation = await validateResetToken(parsed.data.token);

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired reset token",
        },
        { status: 400 }
      );
    }

    await setUserPassword(
      validation.userId,
      parsed.data.newPassword,
      false
    );
    await markTokenUsed(parsed.data.token);

    await writeAuditLog({
      userId: validation.userId,
      username: validation.username,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "user",
      entityId: validation.userId,
      request,
    });

    await writeLoginHistory({
      userId: validation.userId,
      username: validation.username,
      eventType: "PASSWORD_RESET",
      status: "SUCCESS",
      request,
      metadata: { source: "reset_token" },
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now login.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Server Error" },
      { status: 500 }
    );
  }
}
