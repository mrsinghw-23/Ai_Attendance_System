import { NextRequest, NextResponse } from "next/server";

import {

  getAuthUser,

  unauthorizedResponse,

  forbiddenResponse,

  serverErrorResponse,

} from "@/utils/api-auth";

import { canViewCameras } from "@/utils/permissions";

import { listUnknownFaces } from "@/services/ai-recognition.service";



export const dynamic = "force-dynamic";



export async function GET(request: NextRequest) {

  try {

    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();

    if (!canViewCameras(user.role)) return forbiddenResponse();



    const limit = Number(request.nextUrl.searchParams.get("limit") || 50);

    const data = await listUnknownFaces(limit);

    return NextResponse.json({ success: true, data });

  } catch (error) {

    console.error(error);

    return serverErrorResponse();

  }

}

