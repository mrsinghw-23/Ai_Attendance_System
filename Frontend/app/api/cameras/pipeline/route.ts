import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewCameras } from "@/utils/permissions";
import { getCameraPipelineArchitecture } from "@/services/camera-pipeline.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    return NextResponse.json({
      success: true,
      data: getCameraPipelineArchitecture(),
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
