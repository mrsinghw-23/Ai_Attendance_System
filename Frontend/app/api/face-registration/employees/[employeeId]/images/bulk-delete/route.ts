import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuthUserWithPermissions,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { getEmployeeLocation } from "@/utils/face-registration-auth";
import { canDeleteRecords, canPerformLiveFaceRegistration } from "@/utils/permissions";
import { deleteFaceImages } from "@/services/face-registration.service";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

const bodySchema = z.object({
  image_ids: z.array(z.number().int().positive()).min(1),
});

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
    const canManage = canPerformLiveFaceRegistration({
      role: user.role,
      permissions: user.permissions,
      employeeId: id,
      userEmployeeId: user.employee_id,
      userLocationId: user.location_id,
      employeeLocationId,
    });
    const canDelete = canDeleteRecords(user.role);

    if (!canManage && !canDelete) {
      return forbiddenResponse("You do not have permission to delete face images");
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Select at least one image to delete" },
        { status: 400 }
      );
    }

    const result = await deleteFaceImages(parsed.data.image_ids, id);
    if (!result) {
      return NextResponse.json(
        { success: false, message: "No matching images found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.profile,
      embeddingsSynced: result.embeddingsSynced,
      message: `${parsed.data.image_ids.length} face image(s) deleted. AI embeddings removed and cache refreshed.`,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
