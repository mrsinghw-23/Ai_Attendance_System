import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canViewCameras } from "@/utils/permissions";
import { getPcWebcamFieldOptions } from "@/services/pc-webcam-options.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const locationIdRaw = request.nextUrl.searchParams.get("location_id");
    const locationId =
      locationIdRaw && Number.isInteger(Number(locationIdRaw))
        ? Number(locationIdRaw)
        : null;

    const options = await getPcWebcamFieldOptions(locationId);

    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
