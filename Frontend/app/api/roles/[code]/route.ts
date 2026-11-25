import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { UserRole } from "@/types/roles";
import { updateRolePermissions } from "@/services/permission.service";
import { updateRolePermissionsSchema } from "@/schemas/admin.schema";
import { writeAuditLog } from "@/services/audit.service";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse();
    }

    const { code } = await context.params;
    const parsed = updateRolePermissionsSchema.safeParse(
      await request.json()
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message || "Invalid payload",
        },
        { status: 400 }
      );
    }

    const roles = await updateRolePermissions(
      code,
      parsed.data.permissionCodes
    );

    if (!roles) {
      return NextResponse.json(
        { success: false, message: "Role not found" },
        { status: 404 }
      );
    }

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "PERMISSION_CHANGED",
      entityType: "role",
      entityId: code,
      metadata: { permissionCodes: parsed.data.permissionCodes },
      request,
    });

    return NextResponse.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
