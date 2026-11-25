import { NextRequest, NextResponse } from "next/server";

import {

  getAuthUser,

  unauthorizedResponse,

  forbiddenResponse,

  serverErrorResponse,

} from "@/utils/api-auth";

import { canViewCameras } from "@/utils/permissions";

import { getAIRecognitionDashboard } from "@/services/ai-recognition.service";



export const dynamic = "force-dynamic";



export async function GET(request: NextRequest) {

  try {

    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();

    if (!canViewCameras(user.role)) return forbiddenResponse();



    const data = await getAIRecognitionDashboard();

    return NextResponse.json({ success: true, data });

  } catch (error) {

    console.error(error);

    return serverErrorResponse();

  }

}

