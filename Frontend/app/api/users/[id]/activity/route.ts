import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageUsers } from "@/utils/permissions";
import { getUserActivityLogs } from "@/services/user.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const userId = Number(id);
    if (Number.isNaN(userId)) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const limit = Number(
      request.nextUrl.searchParams.get("limit") || 50
    );

    const logs = await getUserActivityLogs(userId, limit);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
