import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { syncEmployeeFaceEmbeddings } from "@/services/face-registration.service";
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

    const result = await syncEmployeeFaceEmbeddings(id);

    if (!result.scannable) {
      return NextResponse.json(
        {
          success: false,
          message:
            result.imageCount === 0
              ? "No face images found for this employee."
              : "Could not generate AI embeddings. Ensure AI-Recognition-Service Python venv is installed and face is visible in saved images.",
          data: result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "AI embeddings synced — employee is ready for camera attendance.",
      data: result,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
