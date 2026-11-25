import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pool from "@/lib/db";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageCameras, canViewCameras } from "@/utils/permissions";
import { DEFAULT_PC_WEBCAM_CONFIG } from "@/types/pc-webcam";

export const dynamic = "force-dynamic";

const configSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  location_id: z.number().int().positive().nullable(),
  branch_name: z.string().trim().max(120),
  entrance: z.string().trim().max(120),
  entry_exit_type: z.enum(["ENTRY", "EXIT", "BOTH", "NONE"]),
  floor: z.string().trim().max(80),
  notes: z.string().trim().max(500),
});

async function readConfig() {
  const result = await pool.query(
    `
    SELECT setting_value
    FROM system_settings
    WHERE category = 'pc_webcam' AND setting_key = 'config'
    LIMIT 1
    `
  );

  const raw = result.rows[0]?.setting_value;
  if (!raw || typeof raw !== "object") {
    return DEFAULT_PC_WEBCAM_CONFIG;
  }

  const parsed = configSchema.safeParse({
    ...DEFAULT_PC_WEBCAM_CONFIG,
    ...(raw as Record<string, unknown>),
    location_id:
      raw && typeof raw === "object" && "location_id" in raw
        ? raw.location_id == null
          ? null
          : Number((raw as { location_id: unknown }).location_id) || null
        : null,
  });

  return parsed.success ? parsed.data : DEFAULT_PC_WEBCAM_CONFIG;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!canViewCameras(user.role)) return forbiddenResponse();

    const config = await readConfig();

    let location_name: string | null = null;
    if (config.location_id) {
      const loc = await pool.query(
        `SELECT location_name FROM locations WHERE id = $1`,
        [config.location_id]
      );
      location_name = loc.rows[0]?.location_name ?? null;
    }

    return NextResponse.json({
      success: true,
      data: { ...config, location_name },
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
    if (!canManageCameras(user.role, user.permissions)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Invalid settings",
        },
        { status: 400 }
      );
    }

    if (parsed.data.location_id) {
      const loc = await pool.query(
        `SELECT id FROM locations WHERE id = $1`,
        [parsed.data.location_id]
      );
      if (!loc.rows[0]) {
        return NextResponse.json(
          { success: false, message: "Location not found" },
          { status: 404 }
        );
      }
    }

    await pool.query(
      `
      INSERT INTO system_settings (
        category, setting_key, setting_value, updated_by, updated_at
      )
      VALUES ('pc_webcam', 'config', $1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (category, setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      `,
      [JSON.stringify(parsed.data), user.id]
    );

    const config = await readConfig();
    let location_name: string | null = null;
    if (config.location_id) {
      const loc = await pool.query(
        `SELECT location_name FROM locations WHERE id = $1`,
        [config.location_id]
      );
      location_name = loc.rows[0]?.location_name ?? null;
    }

    return NextResponse.json({
      success: true,
      data: { ...config, location_name },
      message: "PC webcam settings saved",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
