import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import {
  getUserProfile,
  updateUserProfile,
} from "@/services/user-profile.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().max(200).nullable().optional(),
  mobile: z.string().trim().max(30).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const profile = await getUserProfile(user.id);
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

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const body = await request.json();
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Invalid profile data",
        },
        { status: 400 }
      );
    }

    const profile = await updateUserProfile(user.id, parsed.data);
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
