import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { updateUserProfileImage } from "@/services/user-profile.service";
import { getExtensionFromMime } from "@/utils/profile-image-storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Image file is required" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, message: "Image must be 2 MB or smaller" },
        { status: 400 }
      );
    }

    const extension = getExtensionFromMime(file.type);
    if (!extension) {
      return NextResponse.json(
        { success: false, message: "Use JPG, PNG, or WebP image" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const profile = await updateUserProfileImage(user.id, buffer, extension);

    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
