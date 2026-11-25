import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  JwtPayload,
  verifyToken,
} from "@/utils/jwt";
import { getEffectivePermissions } from "@/services/permission.service";

export interface AuthUser extends JwtPayload {
  location_id: number | null;
  employee_id: number | null;
  permissions?: string[];
}

export async function getAuthUser(
  request: NextRequest
): Promise<AuthUser | null> {
  const token =
    request.cookies.get("token")?.value;

  if (!token) {
    return null;
  }

  const payload =
    verifyToken(token) as JwtPayload | null;

  if (!payload) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT id, username, role, location_id, employee_id
    FROM users
    WHERE id = $1
    `,
    [payload.id]
  );

  return result.rows[0] || null;
}

export async function getAuthUserWithPermissions(
  request: NextRequest
): Promise<AuthUser | null> {
  const user = await getAuthUser(request);
  if (!user) return null;

  const permissions = await getEffectivePermissions(user.role, user.id);
  return { ...user, permissions };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      message: "Unauthorized",
    },
    { status: 401 }
  );
}

export function forbiddenResponse(
  message = "You do not have permission to perform this action"
) {
  return NextResponse.json(
    {
      success: false,
      message,
    },
    { status: 403 }
  );
}

export function badRequestResponse(
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      message,
    },
    { status: 400 }
  );
}

export function serverErrorResponse() {
  return NextResponse.json(
    {
      success: false,
      message: "Server Error",
    },
    { status: 500 }
  );
}
