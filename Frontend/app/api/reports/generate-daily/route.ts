import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { isAIServiceRequest } from "@/utils/ai-service-auth";
import { hasPermission } from "@/utils/permissions";
import { generateDailyReports } from "@/services/daily-report-generator.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const serviceRequest = isAIServiceRequest(request);

    if (!serviceRequest) {
      const user = await getAuthUser(request);
      if (!user) return unauthorizedResponse();
      if (!hasPermission(user.role, "reports")) return forbiddenResponse();
    }

    const body = await request.json().catch(() => ({}));
    const date =
      typeof body.date === "string" && body.date.trim()
        ? body.date.trim()
        : undefined;

    const manifest = await generateDailyReports({ date });

    return NextResponse.json({
      success: true,
      data: manifest,
      message: `Generated ${manifest.files.length} report file(s) for ${manifest.report_date}.`,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
