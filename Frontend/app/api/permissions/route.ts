import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { UserRole } from "@/types/roles";
import { listPermissions } from "@/services/permission.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse();
    }

    const permissions = await listPermissions();

    return NextResponse.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
