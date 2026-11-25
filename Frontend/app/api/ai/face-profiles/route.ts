import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageEmployees } from "@/utils/permissions";
import { faceProfileSchema } from "@/schemas/ai.schema";
import {
  listFaceProfiles,
  upsertFaceProfile,
} from "@/services/ai.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const data = await listFaceProfiles();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const parsed = faceProfileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            "Invalid face profile payload",
        },
        { status: 400 }
      );
    }

    const data = await upsertFaceProfile(parsed.data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
