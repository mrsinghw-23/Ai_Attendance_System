import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { isAIServiceRequest } from "@/utils/ai-service-auth";
import { canViewAttendance } from "@/utils/permissions";
import { UserRole } from "@/types/roles";
import { processEngineSchema } from "@/schemas/attendance-engine.schema";
import { processPendingFaceEvents } from "@/services/attendance-engine.service";
import { publishRealtimeEvent } from "@/services/realtime.service";
import { incrementAIStat } from "@/services/ai-recognition.service";

export async function POST(request: NextRequest) {
  try {
    const serviceRequest = isAIServiceRequest(request);

    if (!serviceRequest) {
      const user = await getAuthUser(request);
      if (!user) return unauthorizedResponse();

      if (
        !canViewAttendance(user.role) ||
        ![UserRole.SUPER_ADMIN, UserRole.ATTENDANCE_ADMIN, UserRole.MANAGER].includes(
          user.role as UserRole
        )
      ) {
        return forbiddenResponse();
      }
    }

    const parsed = processEngineSchema.safeParse(
      await request.json().catch(() => ({}))
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Invalid payload",
        },
        { status: 400 }
      );
    }

    const result = await processPendingFaceEvents(parsed.data);

    if (serviceRequest && result.recordsUpdated > 0) {
      await incrementAIStat("attendance_generated", result.recordsUpdated);
    }

    publishRealtimeEvent("attendance.engine.processed", result);

    return NextResponse.json({
      success: true,
      data: result,
      message: `Processed ${result.eventsProcessed} face event(s).`,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
