import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { UserRole } from "@/types/roles";
import { listRoles } from "@/services/permission.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse();
    }

    const roles = await listRoles();

    return NextResponse.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
