import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canDeleteRecords, canManageLocations } from "@/utils/permissions";
import { updateLocationSchema } from "@/schemas/location.schema";
import {
  deleteLocation,
  getLocationCameras,
  getLocationEmployees,
  getLocationWithStats,
  locationNameExists,
  updateLocation,
} from "@/services/location.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(id: string) {
  const numeric = Number(id);
  return Number.isNaN(numeric) ? null : numeric;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canManageLocations(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const locationId = parseId(id);

    if (locationId === null) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid location ID",
        },
        { status: 400 }
      );
    }

    const location =
      await getLocationWithStats(locationId);

    if (!location) {
      return NextResponse.json(
        {
          success: false,
          message: "Location not found",
        },
        { status: 404 }
      );
    }

    const [employees, cameras] =
      await Promise.all([
        getLocationEmployees(locationId),
        getLocationCameras(locationId),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        ...location,
        employees,
        cameras,
      },
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canManageLocations(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const locationId = parseId(id);

    if (locationId === null) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid location ID",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed =
      updateLocationSchema.safeParse(body);

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

    if (parsed.data.location_name) {
      const exists =
        await locationNameExists(
          parsed.data.location_name,
          locationId
        );

      if (exists) {
        return NextResponse.json(
          {
            success: false,
            message:
              "A location with this name already exists",
          },
          { status: 409 }
        );
      }
    }

    const location = await updateLocation(
      locationId,
      parsed.data
    );

    if (!location) {
      return NextResponse.json(
        {
          success: false,
          message: "Location not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canDeleteRecords(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const locationId = parseId(id);

    if (locationId === null) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid location ID",
        },
        { status: 400 }
      );
    }

    const result = await deleteLocation(
      locationId
    );

    if (!result.deleted) {
      if (result.reason === "not_found") {
        return NextResponse.json(
          {
            success: false,
            message: "Location not found",
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete: ${result.employees} employee(s) and ${result.cameras} camera(s) are still assigned to this location.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
