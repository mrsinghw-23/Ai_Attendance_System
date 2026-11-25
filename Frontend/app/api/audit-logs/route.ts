import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageUsers } from "@/utils/permissions";
import { getAuditLogs } from "@/services/audit.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const { searchParams } = request.nextUrl;
    const logs = await getAuditLogs({
      action: searchParams.get("action") || undefined,
      entityType: searchParams.get("entity_type") || undefined,
      limit: Number(searchParams.get("limit") || 100),
    });

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
