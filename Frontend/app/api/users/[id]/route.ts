import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canDeleteRecords, canManageUsers } from "@/utils/permissions";
import { updateUserSchema } from "@/schemas/admin.schema";
import {
  deleteUser,
  emailExists,
  getUserAccountById,
  updateUser,
  usernameExists,
} from "@/services/user.service";
import { writeAuditLog } from "@/services/audit.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isNaN(id) ? null : id;
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
    const userId = parseId(id);
    if (userId === null) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const account = await getUserAccountById(userId);
    if (!account) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageUsers(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const userId = parseId(id);
    if (userId === null) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    const parsed = updateUserSchema.safeParse(await request.json());

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

    if (
      parsed.data.username &&
      (await usernameExists(parsed.data.username, userId))
    ) {
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
      (await emailExists(parsed.data.email, userId))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Email already exists",
        },
        { status: 409 }
      );
    }

    const existing = await getUserAccountById(userId);
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const updated = await updateUser(userId, parsed.data);

    const action =
      parsed.data.role && parsed.data.role !== existing.role
        ? "ROLE_CHANGED"
        : "USER_UPDATED";

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action,
      entityType: "user",
      entityId: userId,
      metadata: parsed.data,
      request,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canDeleteRecords(user.role)) return forbiddenResponse();

    const { id } = await context.params;
    const userId = parseId(id);
    if (userId === null) {
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 400 }
      );
    }

    if (userId === user.id) {
      return NextResponse.json(
        {
          success: false,
          message: "You cannot delete your own account",
        },
        { status: 400 }
      );
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "USER_DELETED",
      entityType: "user",
      entityId: userId,
      metadata: { username: deleted.username },
      request,
    });

    return NextResponse.json({
      success: true,
      message: "User deleted",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
