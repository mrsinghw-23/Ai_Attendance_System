import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageSettings } from "@/utils/permissions";
import { updateSettingsSchema } from "@/schemas/admin.schema";
import {
  getSettingsGrouped,
  updateSettings,
} from "@/services/settings.service";
import { writeAuditLog } from "@/services/audit.service";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageSettings(user.role)) return forbiddenResponse();

    const settings = await getSettingsGrouped();
    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageSettings(user.role)) return forbiddenResponse();

    const parsed = updateSettingsSchema.safeParse(
      await request.json()
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            "Invalid settings payload",
        },
        { status: 400 }
      );
    }

    const settings = await updateSettings(
      parsed.data.settings,
      user.id
    );

    await writeAuditLog({
      userId: user.id,
      username: user.username,
      action: "SETTINGS_UPDATED",
      entityType: "settings",
      metadata: {
        categories: Object.keys(parsed.data.settings),
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
