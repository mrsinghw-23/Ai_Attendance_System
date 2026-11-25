import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { uploadFaceImage } from "@/services/face-registration.service";
import { faceImageTypeSchema } from "@/schemas/face-registration.schema";
import { FaceImageType } from "@/types/face-registration";
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
    const imageTypeRaw = String(formData.get("image_type") || "");
    const replaceRaw = formData.get("replace_image_id");

    const parsedType = faceImageTypeSchema.safeParse(imageTypeRaw);
    if (!parsedType.success) {
      return NextResponse.json(
        { success: false, message: "Invalid image type" },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Image file is required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const liveSessionId = String(formData.get("live_session_id") || "") || undefined;
    const liveQualityRaw = formData.get("live_quality_score");
    const liveQualityScore = liveQualityRaw
      ? Number(liveQualityRaw)
      : undefined;

    const result = await uploadFaceImage({
      employeeId: id,
      imageType: parsedType.data as FaceImageType,
      buffer,
      mimeType: file.type || "image/jpeg",
      replaceImageId: replaceRaw ? Number(replaceRaw) : undefined,
      liveSessionId,
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
        data: {
          image: result.image,
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
