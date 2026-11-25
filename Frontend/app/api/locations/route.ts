import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import {
  canManageEmployees,
  canManageLocations,
} from "@/utils/permissions";
import { createLocationSchema } from "@/schemas/location.schema";
import {
  createLocation,
  getLocations,
  getLocationsWithStats,
  locationNameExists,
} from "@/services/location.service";

export async function GET(
  request: NextRequest
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    // Locations are needed for employee forms (managers + admins),
    // so allow read access to anyone who can manage employees or locations.
    if (
      !canManageEmployees(user.role) &&
      !canManageLocations(user.role)
    ) {
      return forbiddenResponse();
    }

    const { searchParams } =
      request.nextUrl;
    const withStats =
      searchParams.get("stats") === "true";

    const data =
      withStats && canManageLocations(user.role)
        ? await getLocationsWithStats()
        : await getLocations();

    return NextResponse.json({
      success: true,
      data,
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

    if (!canManageLocations(user.role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const parsed =
      createLocationSchema.safeParse(body);

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

    const exists = await locationNameExists(
      parsed.data.location_name
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

    const location = await createLocation(
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        data: location,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
