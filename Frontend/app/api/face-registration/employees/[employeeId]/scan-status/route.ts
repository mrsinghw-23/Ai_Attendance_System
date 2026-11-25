import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewCameras } from "@/utils/permissions";
import { getEmployeeFaceScanStatus } from "@/services/employee-encoding-cache.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const { employeeId: rawId } = await context.params;
    const employeeId = Number(rawId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid employee id" },
        { status: 400 }
      );
    }

    const status = await getEmployeeFaceScanStatus(employeeId);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
