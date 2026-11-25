import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageCameras } from "@/utils/permissions";
import { probeCameraSchema } from "@/schemas/camera.schema";
import { formatProbeErrorCode } from "@/utils/camera-probe-errors";
import { probeCameraConfig } from "@/services/camera-probe.service";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canManageCameras(user.role)) return forbiddenResponse();

    const body = await request.json();
    const parsed = probeCameraSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Invalid probe data",
        },
        { status: 400 }
      );
    }

    if (!parsed.data.rtsp_password?.trim() && !parsed.data.rtsp_direct_url?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Enter RTSP password or paste Direct RTSP Link",
        },
        { status: 400 }
      );
    }

    const diagnostics = await probeCameraConfig(parsed.data);

    let databaseOk = false;
    try {
      await pool.query("SELECT 1");
      databaseOk = true;
    } catch {
      databaseOk = false;
    }

    const enriched = {
      ...diagnostics,
      checked_at: new Date().toISOString(),
      opencv_ok: diagnostics.frame_captured,
      python_service_ok: diagnostics.frame_captured || diagnostics.rtsp_connected,
      database_ok: databaseOk,
      attendance_engine_ok: databaseOk,
      message: diagnostics.frame_captured
        ? "Camera test passed — live stream ready"
        : formatProbeErrorCode(diagnostics.error_code),
    };

    return NextResponse.json({
      success: Boolean(diagnostics.frame_captured),
      data: enriched,
      message: enriched.message,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
