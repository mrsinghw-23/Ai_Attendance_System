import { NextRequest, NextResponse } from "next/server";
import {
  forgotPasswordSchema,
} from "@/schemas/admin.schema";
import { writeAuditLog } from "@/services/audit.service";
import { writeLoginHistory } from "@/services/login-history.service";
import {
  createPasswordResetToken,
  findUserByUsernameOrEmail,
} from "@/services/password-reset.service";

export async function POST(request: NextRequest) {
  try {
    const parsed = forgotPasswordSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message || "Invalid request",
        },
        { status: 400 }
      );
    }

    const account = await findUserByUsernameOrEmail(
      parsed.data.identifier
    );

    if (!account) {
      return NextResponse.json({
        success: true,
        message:
          "If an account exists, password reset instructions have been sent.",
      });
    }

    if (account.status === "INACTIVE") {
      return NextResponse.json(
        {
          success: false,
          message: "Account is inactive. Contact your administrator.",
        },
        { status: 403 }
      );
    }

    const { token } = await createPasswordResetToken(account.id);

    await writeAuditLog({
      userId: account.id,
      username: account.username,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "user",
      entityId: account.id,
      request,
    });

    await writeLoginHistory({
      userId: account.id,
      username: account.username,
      eventType: "PASSWORD_RESET",
      status: "SUCCESS",
      request,
      metadata: { source: "forgot_password" },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    return NextResponse.json({
      success: true,
      message:
        "If an account exists, password reset instructions have been sent.",
      resetUrl,
      token,
      expiresInMinutes: 15,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Server Error" },
      { status: 500 }
    );
  }
}
