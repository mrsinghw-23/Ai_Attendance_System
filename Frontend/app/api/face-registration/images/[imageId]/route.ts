import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import {
  assertLiveFaceRegistrationAccess,
} from "@/utils/face-registration-auth";
import { canDeleteRecords, canPerformLiveFaceRegistration } from "@/utils/permissions";
import { deleteFaceImage } from "@/services/face-registration.service";
import pool from "@/lib/db";
import type { FaceImageType } from "@/types/face-registration";

interface RouteContext {
  params: Promise<{ imageId: string }>;
}

async function getImageContext(imageId: number) {
  const imageRow = await pool.query(
    `
    SELECT efi.employee_id, efi.image_type, e.location_id
    FROM employee_face_images efi
    JOIN employees e ON e.id = efi.employee_id
    WHERE efi.id = $1
    `,
    [imageId]
  );
  return imageRow.rows[0] as
    | {
        employee_id: number;
        image_type: FaceImageType;
        location_id: number | null;
      }
    | undefined;
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUserWithPermissions(request);
    if (!user) return unauthorizedResponse();

    const { imageId } = await context.params;
    const id = Number(imageId);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid image ID" },
        { status: 400 }
      );
    }

    const row = await getImageContext(id);
    if (!row) {
      return NextResponse.json(
        { success: false, message: "Image not found" },
        { status: 404 }
      );
    }

    if (!canDeleteRecords(user.role)) {
      const manageAllowed = canPerformLiveFaceRegistration({
        role: user.role,
        permissions: user.permissions,
        employeeId: row.employee_id,
        userEmployeeId: user.employee_id,
        userLocationId: user.location_id,
        employeeLocationId: row.location_id,
      });
      if (!manageAllowed) {
        return forbiddenResponse("You do not have permission to delete face images");
      }
    }

    const profile = await deleteFaceImage(id, row.employee_id);
    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Image not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile,
      message: "Face image deleted. AI embeddings removed and cache refreshed.",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUserWithPermissions(request);
    if (!user) return unauthorizedResponse();

    const { imageId } = await context.params;
    const replaceId = Number(imageId);
    if (Number.isNaN(replaceId)) {
      return NextResponse.json(
        { success: false, message: "Invalid image ID" },
        { status: 400 }
      );
    }

    const row = await getImageContext(replaceId);
    if (!row) {
      return NextResponse.json(
        { success: false, message: "Image not found" },
        { status: 404 }
      );
    }

    const denied = assertLiveFaceRegistrationAccess(
      user,
      row.employee_id,
      row.location_id
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

    const { uploadFaceImage } = await import(
      "@/services/face-registration.service"
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const liveSessionId = String(formData.get("live_session_id") || "") || undefined;
    const liveQualityRaw = formData.get("live_quality_score");
    const liveQualityScore = liveQualityRaw
      ? Number(liveQualityRaw)
      : undefined;

    const result = await uploadFaceImage({
      employeeId: row.employee_id,
      imageType: row.image_type,
      buffer,
      mimeType: file.type || "image/jpeg",
      replaceImageId: replaceId,
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

    return NextResponse.json({
      success: true,
      data: {
        image: result.image,
        profile: result.profile,
        quality: result.quality,
        embeddingsSynced: result.embeddingsSynced,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
