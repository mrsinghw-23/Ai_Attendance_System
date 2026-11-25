import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageUsers } from "@/utils/permissions";
import { getUserStats } from "@/services/user.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const stats = await getUserStats();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
