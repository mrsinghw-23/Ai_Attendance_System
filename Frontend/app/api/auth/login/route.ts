import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { getUserByUsername } from "@/services/auth.service";
import { writeAuditLog } from "@/services/audit.service";
import { writeLoginHistory } from "@/services/login-history.service";
import { getEffectivePermissions } from "@/services/permission.service";
import { updateLastLogin } from "@/services/user.service";
import { generateToken } from "@/utils/jwt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "Username and Password required",
        },
        { status: 400 }
      );
    }

    const user = await getUserByUsername(username);

    if (!user) {
      await writeAuditLog({
        username,
        action: "LOGIN_FAILED",
        entityType: "auth",
        metadata: { reason: "user_not_found" },
        request,
      });
      await writeLoginHistory({
        username,
        eventType: "LOGIN_FAILURE",
        status: "FAILURE",
        request,
        metadata: { reason: "user_not_found" },
      });

      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 401 }
      );
    }

    if (user.status === "INACTIVE") {
      await writeAuditLog({
        userId: user.id,
        username: user.username,
        action: "LOGIN_BLOCKED",
        entityType: "auth",
        metadata: { reason: "inactive_account" },
        request,
      });
      await writeLoginHistory({
        userId: user.id,
        username: user.username,
        eventType: "LOGIN_FAILURE",
        status: "BLOCKED",
        request,
        metadata: { reason: "inactive_account" },
      });

      return NextResponse.json(
        {
          success: false,
          message: "Account is inactive",
        },
        { status: 403 }
      );
    }

    const passwordHash = user.password || "";
    const passwordMatches = /^\$2[aby]\$/.test(passwordHash)
      ? await bcrypt.compare(password, passwordHash)
      : passwordHash === password;

    if (!passwordMatches) {
      await writeAuditLog({
        userId: user.id,
        username: user.username,
        action: "LOGIN_FAILED",
        entityType: "auth",
        metadata: { reason: "invalid_password" },
        request,
      });
      await writeLoginHistory({
        userId: user.id,
        username: user.username,
        eventType: "LOGIN_FAILURE",
        status: "FAILURE",
        request,
        metadata: { reason: "invalid_password" },
      });

      return NextResponse.json(
        {
          success: false,
          message: "Invalid password",
        },
        { status: 401 }
      );
    }

    await updateLastLogin(user.id);

    const permissions = await getEffectivePermissions(
      user.role,
      user.id
    );

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employee_id: user.employee_id,
        location_id: user.location_id,
        status: user.status,
        password_reset_required: user.password_reset_required,
        permissions,
      },
      redirectTo: user.password_reset_required
        ? "/change-password"
        : "/",
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "LOGIN_SUCCESS",
      entityType: "auth",
      request,
    });
    await writeLoginHistory({
      userId: user.id,
      username: user.username,
      eventType: "LOGIN_SUCCESS",
      status: "SUCCESS",
      request,
    });

    return response;
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Server Error",
      },
      { status: 500 }
    );
  }
}
