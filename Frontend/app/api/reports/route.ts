import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import { ReportType } from "@/types/phase6";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { hasPermission } from "@/utils/permissions";
import { reportFiltersSchema } from "@/schemas/report.schema";
import { getReport } from "@/services/report.service";

function parseReportScope(
  user: {
    role: string;
    location_id: number | null;
    employee_id: number | null;
  },
  searchParams: URLSearchParams
) {
  const parsed = reportFiltersSchema.safeParse(
    Object.fromEntries(searchParams)
  );

  const filters = parsed.success ? parsed.data : { type: "attendance" };

  return {
    role: user.role,
    locationId: user.location_id,
    employeeId: user.employee_id,
    from: filters.from || null,
    to: filters.to || null,
    fromTime: filters.fromTime || null,
    toTime: filters.toTime || null,
  };
}

function isReportType(value: string): value is ReportType {
  return [
    "attendance",
    "employees",
    "locations",
    "cameras",
    "audit",
    "daily_attendance",
    "employee_attendance",
    "late_arrival",
    "half_day",
    "absent",
    "working_hours",
    "movement",
    "camera_activity",
    "location_attendance",
    "camera_health",
    "camera_uptime",
    "camera_downtime",
    "camera_attendance",
    "motion_detection",
    "location_camera",
    "face_registration",
    "missing_face_profiles",
    "registration_progress",
    "ai_face_recognition",
    "ai_gate_attendance",
    "unknown_faces",
  ].includes(value);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!hasPermission(user.role, "reports")) return forbiddenResponse();

    const type = request.nextUrl.searchParams.get("type") || "attendance";
    if (!isReportType(type)) {
      return NextResponse.json(
        { success: false, message: "Invalid report type" },
        { status: 400 }
      );
    }

    if (type === "audit" && user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse();
    }

    const report = await getReport(type, parseReportScope(user, request.nextUrl.searchParams));

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
