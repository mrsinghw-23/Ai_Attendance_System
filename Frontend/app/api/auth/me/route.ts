import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/utils/jwt";
import { getEffectivePermissions } from "@/services/permission.service";
import { getUserProfile } from "@/services/user-profile.service";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const user = verifyToken(token) as {
      id: number;
      username: string;
      role: string;
    } | null;

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Token",
        },
        { status: 401 }
      );
    }

    const profile = await getUserProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 }
      );
    }

    if (profile.status === "INACTIVE") {
      return NextResponse.json(
        {
          success: false,
          message: "Account is inactive",
        },
        { status: 403 }
      );
    }

    const permissions = await getEffectivePermissions(profile.role, profile.id);

    return NextResponse.json({
      success: true,
      user: {
        ...profile,
        permissions,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Server Error",
      },
      { status: 500 }
    );
  }
}
