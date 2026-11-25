import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { writeLoginHistory } from "@/services/login-history.service";
import { writeAuditLog } from "@/services/audit.service";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    if (user) {
      await writeAuditLog({
        userId: user.id,
        username: user.username,
        action: "LOGOUT",
        entityType: "auth",
        request,
      });
      await writeLoginHistory({
        userId: user.id,
        username: user.username,
        eventType: "LOGOUT",
        status: "SUCCESS",
        request,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    response.cookies.set("token", "", {
      httpOnly: true,
      expires: new Date(0),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
