import { NextRequest, NextResponse } from "next/server";

import {

  getAuthUser,

  unauthorizedResponse,

  forbiddenResponse,

  serverErrorResponse,

} from "@/utils/api-auth";

import { canManageSettings, canViewCameras } from "@/utils/permissions";

import { aiRecognitionSettingsSchema } from "@/schemas/ai-recognition.schema";

import {

  getAIRecognitionSettings,

  updateAIRecognitionSettings,

  getEmbeddingSyncStatus,

} from "@/services/ai-recognition.service";



export const dynamic = "force-dynamic";



export async function GET(request: NextRequest) {

  try {

    const user = await getAuthUser(request);

    if (!user) return unauthorizedResponse();

    if (!canViewCameras(user.role)) return forbiddenResponse();



    const [settings, embeddings] = await Promise.all([

      getAIRecognitionSettings(),

      getEmbeddingSyncStatus(),

    ]);



    return NextResponse.json({

      success: true,

      data: {

        settings,

        embeddings,

      },

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

    if (!canManageSettings(user.role)) return forbiddenResponse();



    const parsed = aiRecognitionSettingsSchema.safeParse(

      await request.json()

    );



    if (!parsed.success) {

      return NextResponse.json(

        {

          success: false,

          message:

            parsed.error.issues[0]?.message ||

            "Invalid AI recognition settings",

        },

        { status: 400 }

      );

    }



    const settings = await updateAIRecognitionSettings(parsed.data);

    return NextResponse.json({ success: true, data: settings });

  } catch (error) {

    console.error(error);

    return serverErrorResponse();

  }

}

