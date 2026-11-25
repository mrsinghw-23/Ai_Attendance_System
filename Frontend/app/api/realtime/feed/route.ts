import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { getRealtimeEvents } from "@/services/realtime.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    return NextResponse.json({
      success: true,
      data: getRealtimeEvents(),
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
