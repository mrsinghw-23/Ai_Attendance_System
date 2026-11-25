import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canAccessEmployeeFaceRegistration } from "@/utils/permissions";
import { getEmployeeFaceRegistration } from "@/services/face-registration.service";
import { getEmployeeFaceScanStatus } from "@/services/employee-encoding-cache.service";
import { deriveAIReadiness } from "@/utils/ai-readiness";
import pool from "@/lib/db";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

async function getEmployeeLocation(employeeId: number) {
  const result = await pool.query(
    `SELECT location_id FROM employees WHERE id = $1`,
    [employeeId]
  );
  return (result.rows[0]?.location_id as number | null) ?? null;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);
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
    const allowed = canAccessEmployeeFaceRegistration({
      role: user.role,
      permissions: undefined,
      employeeId: id,
      userEmployeeId: user.employee_id,
      userLocationId: user.location_id,
      employeeLocationId,
    });

    if (!allowed) return forbiddenResponse();

    const [data, scanStatus] = await Promise.all([
      getEmployeeFaceRegistration(id),
      getEmployeeFaceScanStatus(id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        ai_scannable: scanStatus.scannable,
        embedding_count: scanStatus.embedding_count,
        ai_readiness: deriveAIReadiness({
          imageCount: scanStatus.image_count ?? 0,
          embeddingCount: scanStatus.embedding_count ?? 0,
          profileStatus: data.profile_status,
        }),
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
