import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { isAIServiceRequest } from "@/utils/ai-service-auth";
import { canViewCameras } from "@/utils/permissions";
import { faceEventSchema } from "@/schemas/ai.schema";
import { listFaceEvents } from "@/services/ai.service";
import { ingestFaceEventAndMarkAttendance } from "@/services/attendance-live.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const data = await listFaceEvents();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRequest = isAIServiceRequest(request);

    if (!serviceRequest) {
      const user = await getAuthUser(request);
      if (!user) return unauthorizedResponse();
      if (!canViewCameras(user.role)) return forbiddenResponse();
    }

    const parsed = faceEventSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            "Invalid face event payload",
        },
        { status: 400 }
      );
    }

    const { faceEvent, attendance } = await ingestFaceEventAndMarkAttendance(
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        data: faceEvent,
        attendance,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
