import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { hasPermission } from "@/utils/permissions";
import {
  reportContentType,
} from "@/services/daily-report-generator.service";

export const dynamic = "force-dynamic";

const ARCHIVE_ROOT = path.join(process.cwd(), "storage", "daily-reports");

async function readManifest(date: string) {
  const manifestPath = path.join(ARCHIVE_ROOT, date, "manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw) as {
      report_date: string;
      generated_at: string;
      output_dir: string;
      files: Array<{
        type: string;
        format: string;
        file: string;
        rows: number;
      }>;
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorizedResponse();
    if (!hasPermission(user.role, "reports")) return forbiddenResponse();

    const date = request.nextUrl.searchParams.get("date");
    const type = request.nextUrl.searchParams.get("type");
    const format = request.nextUrl.searchParams.get("format");

    if (date && type && format) {
      const fileName = `${type}.${format === "excel" ? "xls" : format}`;
      const filePath = path.join(ARCHIVE_ROOT, date, fileName);
      const body = await fs.readFile(filePath);
      const extension = format === "excel" ? "xls" : format;

      return new NextResponse(body, {
        headers: {
          "Content-Type": reportContentType(format as "csv" | "excel" | "pdf"),
          "Content-Disposition": `attachment; filename="${type}-${date}.${extension}"`,
        },
      });
    }

    let dates: string[] = [];
    try {
      dates = (await fs.readdir(ARCHIVE_ROOT))
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
        .sort((a, b) => b.localeCompare(a));
    } catch {
      dates = [];
    }

    const limit = Math.min(
      30,
      Number(request.nextUrl.searchParams.get("limit") || 14)
    );
    const manifests = (
      await Promise.all(dates.slice(0, limit).map((entry) => readManifest(entry)))
    ).filter(Boolean);

    return NextResponse.json({
      success: true,
      data: {
        dates,
        archives: manifests,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
