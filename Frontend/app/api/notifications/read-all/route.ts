import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { markAllNotificationsRead } from "@/services/notification.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const count = await markAllNotificationsRead(user.id, user.role);

    return NextResponse.json({
      success: true,
      data: { marked: count },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
