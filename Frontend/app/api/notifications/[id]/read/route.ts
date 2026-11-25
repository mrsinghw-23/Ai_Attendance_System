import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { markNotificationRead } from "@/services/notification.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const { id } = await context.params;
    const notificationId = Number(id);

    if (Number.isNaN(notificationId)) {
      return NextResponse.json(
        { success: false, message: "Invalid notification ID" },
        { status: 400 }
      );
    }

    const notification = await markNotificationRead(
      notificationId,
      user.id,
      user.role
    );

    if (!notification) {
      return NextResponse.json(
        { success: false, message: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
