import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import { ExportFormat, ReportType } from "@/types/phase6";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { hasPermission } from "@/utils/permissions";
import { reportFiltersSchema } from "@/schemas/report.schema";
import { getReport } from "@/services/report.service";
import {
  reportToCsv,
  reportToExcelHtml,
  reportToPdf,
} from "@/utils/export";

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

function isExportFormat(value: string): value is ExportFormat {
  return ["csv", "excel", "pdf"].includes(value);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!hasPermission(user.role, "reports")) return forbiddenResponse();

    const type = request.nextUrl.searchParams.get("type") || "attendance";
    const format = request.nextUrl.searchParams.get("format") || "csv";

    if (!isReportType(type) || !isExportFormat(format)) {
      return NextResponse.json(
        { success: false, message: "Invalid export request" },
        { status: 400 }
      );
    }

    if (type === "audit" && user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse();
    }

    const report = await getReport(type, {
      role: user.role,
      locationId: user.location_id,
      employeeId: user.employee_id,
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to"),
      fromTime: request.nextUrl.searchParams.get("fromTime"),
      toTime: request.nextUrl.searchParams.get("toTime"),
    });

    if (format === "pdf") {
      return new NextResponse(reportToPdf(report), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${type}-report.pdf"`,
        },
      });
    }

    if (format === "excel") {
      return new NextResponse(reportToExcelHtml(report), {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${type}-report.xls"`,
        },
      });
    }

    return new NextResponse(reportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-report.csv"`,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
