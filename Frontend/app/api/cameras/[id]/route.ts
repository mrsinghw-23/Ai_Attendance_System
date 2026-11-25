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
  canDeleteRecords,
} from "@/utils/permissions";
import { updateCameraSchema, UpdateCameraInput } from "@/schemas/camera.schema";
import {
  cameraCodeExists,
  cameraNameExists,
  deleteCamera,
  getCameraById,
  updateCamera,
} from "@/services/camera.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(id: string) {
  const numeric = Number(id);
  return Number.isNaN(numeric) ? null : numeric;
}

function managerScope(role: string, locationId: number | null) {
  return role === UserRole.MANAGER ? locationId : null;
}

/** True when at least one updatable field is present in the payload. */
function hasUpdatableFields(data: UpdateCameraInput): boolean {
  return Object.entries(data).some(([, value]) => value !== undefined);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canViewCameras(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const cameraId = parseId(id);

    if (cameraId === null) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid camera ID",
        },
        { status: 400 }
      );
    }

    const camera = await getCameraById(
      cameraId,
      managerScope(user.role, user.location_id)
    );

    if (!camera) {
      return NextResponse.json(
        {
          success: false,
          message: "Camera not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: camera,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canManageCameras(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const cameraId = parseId(id);

    if (cameraId === null) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid camera ID",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateCameraSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues[0]?.message || "Validation failed",
        },
        { status: 400 }
      );
    }

    if (!hasUpdatableFields(parsed.data)) {
      return NextResponse.json(
        {
          success: false,
          message: "No fields provided to update",
        },
        { status: 400 }
      );
    }

    console.log(`[PUT /api/cameras/${cameraId}] payload:`, parsed.data);

    if (parsed.data.camera_name) {
      const exists = await cameraNameExists(parsed.data.camera_name, cameraId);

      if (exists) {
        return NextResponse.json(
          {
            success: false,
            message: "A camera with this name already exists",
          },
          { status: 409 }
        );
      }
    }

    if (parsed.data.camera_code) {
      const codeExists = await cameraCodeExists(parsed.data.camera_code, cameraId);

      if (codeExists) {
        return NextResponse.json(
          {
            success: false,
            message: "A camera with this code already exists",
          },
          { status: 409 }
        );
      }
    }

    const camera = await updateCamera(cameraId, parsed.data);

    if (!camera) {
      return NextResponse.json(
        {
          success: false,
          message: "Camera not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: camera,
    });
  } catch (error) {
    console.error("[PUT /api/cameras/[id]]", error);
    return serverErrorResponse();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canDeleteRecords(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const cameraId = parseId(id);

    if (cameraId === null) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid camera ID",
        },
        { status: 400 }
      );
    }

    const deleted = await deleteCamera(cameraId);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          message: "Camera not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Camera deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
