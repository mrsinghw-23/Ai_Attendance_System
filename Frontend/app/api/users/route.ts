import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageUsers } from "@/utils/permissions";
import { createUserSchema } from "@/schemas/admin.schema";
import {
  createUser,
  emailExists,
  listUsers,
  usernameExists,
} from "@/services/user.service";
import { writeAuditLog } from "@/services/audit.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const users = await listUsers();
    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const parsed = createUserSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message || "Validation failed",
        },
        { status: 400 }
      );
    }

    if (await usernameExists(parsed.data.username)) {
      return NextResponse.json(
        {
          success: false,
          message: "Username already exists",
        },
        { status: 409 }
      );
    }

    if (
      parsed.data.email &&
      (await emailExists(parsed.data.email))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Email already exists",
        },
        { status: 409 }
      );
    }

    const created = await createUser(parsed.data);
    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "USER_CREATED",
      entityType: "user",
      entityId: created?.id,
      metadata: {
        username: created?.username,
        role: created?.role,
      },
      request,
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
