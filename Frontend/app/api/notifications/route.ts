import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import {
  createNotification,
  listNotifications,
} from "@/services/notification.service";
import { writeAuditLog } from "@/services/audit.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const unreadOnly =
      request.nextUrl.searchParams.get("unread") === "true";

    const data = await listNotifications({
      userId: user.id,
      role: user.role,
      unreadOnly,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    const notification = await createNotification({
      userId: body.user_id ?? null,
      role: body.role ?? null,
      title: body.title,
      message: body.message,
      type: body.type,
      priority: body.priority,
      entityType: body.entity_type,
      entityId: body.entity_id,
    });

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "NOTIFICATION_CREATED",
      entityType: "notification",
      entityId: notification.id,
      request,
    });

    return NextResponse.json(
      { success: true, data: notification },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
