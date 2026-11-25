import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { completeLiveRegistrationSession } from "@/services/face-registration.service";
import {
  assertLiveFaceRegistrationAccess,
  getEmployeeLocation,
} from "@/utils/face-registration-auth";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUserWithPermissions(request);
    if (!user) return unauthorizedResponse();

    const { employeeId } = await context.params;
    const id = Number(employeeId);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid employee ID" },
        { status: 400 }
      );
    }

    const employeeLocationId = await getEmployeeLocation(id);
    const denied = assertLiveFaceRegistrationAccess(
      user,
      id,
      employeeLocationId
    );
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const sessionId = String(body.session_id || "").trim();
    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: "session_id is required" },
        { status: 400 }
      );
    }

    const result = await completeLiveRegistrationSession(id, sessionId);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message, data: { profile: result.profile } },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        profile: result.profile,
        embeddingsSynced: result.embeddingsSynced,
        embeddingOutput: result.embeddingOutput,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
