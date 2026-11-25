import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { checkAiPythonHealth } from "@/utils/embedding-sync";
import { countScannableEmployees } from "@/services/employee-encoding-cache.service";
import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();

    const [pythonHealth, scannableCount, pendingSync] = await Promise.all([
      checkAiPythonHealth(),
      countScannableEmployees(),
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM employees e
        WHERE COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
          AND COALESCE(e.face_registration_status, 'NOT_REGISTERED') = 'REGISTERED'
          AND NOT EXISTS (
            SELECT 1 FROM face_embeddings fe
            WHERE fe.employee_id = e.id
              AND fe.embedding_data IS NOT NULL
              AND fe.embedding_data <> ''
          )
      `),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        python_ok: pythonHealth.ok,
        python_detail: pythonHealth.output,
        scannable_employees: scannableCount,
        sync_pending_employees: Number(pendingSync.rows[0]?.count || 0),
        ready: pythonHealth.ok && scannableCount > 0,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
