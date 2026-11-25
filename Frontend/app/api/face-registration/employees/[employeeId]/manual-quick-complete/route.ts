import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { saveManualQuickFaceRegistration } from "@/services/face-registration.service";
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

    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Image file is required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const liveQualityRaw = formData.get("live_quality_score");
    const liveQualityScore = liveQualityRaw
      ? Number(liveQualityRaw)
      : undefined;

    const result = await saveManualQuickFaceRegistration({
      employeeId: id,
      buffer,
      mimeType: file.type || "image/jpeg",
      liveQualityScore: Number.isFinite(liveQualityScore)
        ? liveQualityScore
        : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          quality: result.quality,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.embeddingsSynced
          ? "Face registration 100% complete — AI ready"
          : "Face saved (100%) but AI sync failed — click Sync AI Embeddings",
        data: {
          profile: result.profile,
          quality: result.quality,
          embeddingsSynced: result.embeddingsSynced,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
