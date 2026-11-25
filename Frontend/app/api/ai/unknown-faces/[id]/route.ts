import { NextRequest, NextResponse } from "next/server";

import {

  getAuthUserWithPermissions,

  unauthorizedResponse,

  forbiddenResponse,

  serverErrorResponse,

} from "@/utils/api-auth";

import { canDeleteRecords, canManageAttendance } from "@/utils/permissions";

import { deleteUnknownFace } from "@/services/ai-recognition.service";



export const dynamic = "force-dynamic";



interface RouteContext {

  params: Promise<{ id: string }>;

}



export async function DELETE(

  request: NextRequest,

  context: RouteContext

) {

  try {

    const user = await getAuthUserWithPermissions(request);

    if (!user) return unauthorizedResponse();

    if (!canDeleteRecords(user.role) && !canManageAttendance(user.role, user.permissions)) {
      return forbiddenResponse();
    }



    const { id: idParam } = await context.params;

    const id = Number(idParam);

    if (!Number.isInteger(id) || id <= 0) {

      return NextResponse.json(

        { success: false, message: "Invalid id" },

        { status: 400 }

      );

    }



    const result = await deleteUnknownFace(id);

    if (!result.deleted) {

      return NextResponse.json(

        { success: false, message: "Unknown face record not found" },

        { status: 404 }

      );

    }



    return NextResponse.json({

      success: true,

      message: "Unknown face record deleted",

    });

  } catch (error) {

    console.error(error);

    return serverErrorResponse();

  }

}

