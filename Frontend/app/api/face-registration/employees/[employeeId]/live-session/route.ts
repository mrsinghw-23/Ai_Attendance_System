import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { startLiveRegistrationSession } from "@/services/face-registration.service";
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

    const data = await startLiveRegistrationSession(id, sessionId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
