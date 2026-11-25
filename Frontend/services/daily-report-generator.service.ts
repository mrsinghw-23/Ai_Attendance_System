import fs from "fs/promises";
import path from "path";
import { UserRole } from "@/types/roles";
import { ExportFormat, ReportType } from "@/types/phase6";
import { getReport } from "@/services/report.service";
import { reportToCsv, reportToExcelHtml, reportToPdf } from "@/utils/export";
import { getTodayInTimezone, toDateOnlyInTimezone } from "@/utils/timezone";

const DAILY_REPORT_TYPES: ReportType[] = [
  "daily_attendance",
  "employee_attendance",
  "late_arrival",
  "half_day",
  "absent",
  "working_hours",
  "movement",
  "camera_activity",
  "camera_health",
  "ai_face_recognition",
  "unknown_faces",
];

const EXPORT_FORMATS: ExportFormat[] = ["csv", "excel", "pdf"];

function yesterdayDate() {
  const today = new Date(`${getTodayInTimezone()}T12:00:00`);
  today.setDate(today.getDate() - 1);
  return toDateOnlyInTimezone(today);
}

function reportBody(report: Awaited<ReturnType<typeof getReport>>, format: ExportFormat) {
  if (format === "csv") return reportToCsv(report);
  if (format === "excel") return reportToExcelHtml(report);
  return reportToPdf(report);
}

function reportExtension(format: ExportFormat) {
  if (format === "excel") return "xls";
  return format;
}

function reportContentType(format: ExportFormat) {
  if (format === "csv") return "text/csv;charset=utf-8";
  if (format === "excel") return "application/vnd.ms-excel;charset=utf-8";
  return "application/pdf";
}

export async function generateDailyReports(options: {
  date?: string;
  formats?: ExportFormat[];
  types?: ReportType[];
} = {}) {
  const reportDate = options.date || yesterdayDate();
  const formats = options.formats?.length ? options.formats : EXPORT_FORMATS;
  const types = options.types?.length ? options.types : DAILY_REPORT_TYPES;
  const outputDir = path.join(
    process.cwd(),
    "storage",
    "daily-reports",
    reportDate
  );

  await fs.mkdir(outputDir, { recursive: true });

  const scope = {
    role: UserRole.SUPER_ADMIN,
    from: reportDate,
    to: reportDate,
  };

  const generated: Array<{
    type: ReportType;
    format: ExportFormat;
    file: string;
    rows: number;
  }> = [];

  for (const type of types) {
    const report = await getReport(type, scope);

    for (const format of formats) {
      const extension = reportExtension(format);
      const fileName = `${type}.${extension}`;
      const filePath = path.join(outputDir, fileName);
      const body = reportBody(report, format);

      await fs.writeFile(filePath, body, format === "pdf" ? undefined : "utf8");
      generated.push({
        type,
        format,
        file: path.relative(process.cwd(), filePath),
        rows: report.rows.length,
      });
    }
  }

  const manifest = {
    report_date: reportDate,
    generated_at: new Date().toISOString(),
    output_dir: path.relative(process.cwd(), outputDir),
    files: generated,
  };

  await fs.writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  return manifest;
}

export { DAILY_REPORT_TYPES, EXPORT_FORMATS, reportContentType, reportExtension };
