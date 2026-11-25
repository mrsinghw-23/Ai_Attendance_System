import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import {
  canManageCameras,
  canViewCameras,
} from "@/utils/permissions";
import { createCameraSchema } from "@/schemas/camera.schema";
import {
  cameraCodeExists,
  cameraNameExists,
  createCamera,
  getCameras,
} from "@/services/camera.service";
import { CameraStatus } from "@/types/camera";

function managerScope(
  role: string,
  locationId: number | null
) {
  return role === UserRole.MANAGER
    ? locationId
    : null;
}

export async function GET(
  request: NextRequest
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canViewCameras(user.role)) {
      return forbiddenResponse();
    }

    const { searchParams } =
      request.nextUrl;

    const cameras = await getCameras({
      search:
        searchParams.get("search") || "",
      status:
        (searchParams.get("status") ||
          "") as CameraStatus | "",
      location_id: searchParams.get(
        "location_id"
      )
        ? Number(
            searchParams.get("location_id")
          )
        : undefined,
      managerLocationId: managerScope(
        user.role,
        user.location_id
      ),
    });

    return NextResponse.json({
      success: true,
      data: cameras,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canManageCameras(user.role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const parsed =
      createCameraSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            "Validation failed",
        },
        { status: 400 }
      );
    }

    const exists = await cameraNameExists(
      parsed.data.camera_name
    );

    if (exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A camera with this name already exists",
        },
        { status: 409 }
      );
    }

    if (parsed.data.camera_code) {
      const codeExists = await cameraCodeExists(
        parsed.data.camera_code
      );

      if (codeExists) {
        return NextResponse.json(
          {
            success: false,
            message:
              "A camera with this code already exists",
          },
          { status: 409 }
        );
      }
    }

    const camera = await createCamera(
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        data: camera,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
