import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canManageEmployees } from "@/utils/permissions";
import {
  createEmployeeSchema,
} from "@/schemas/employee.schema";
import {
  createEmployee,
  employeeCodeExists,
  getEmployees,
} from "@/services/employee.service";
import { EmployeeStatus } from "@/types/employee";

function getManagerLocationId(
  role: string,
  locationId: number | null
) {
  if (role === UserRole.MANAGER) {
    return locationId;
  }

  return null;
}

export async function GET(
  request: NextRequest
) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return unauthorizedResponse();
    }

    if (!canManageEmployees(user.role)) {
      return forbiddenResponse();
    }

    const { searchParams } =
      request.nextUrl;

    const page = Number(
      searchParams.get("page") || 1
    );
    const limit = Number(
      searchParams.get("limit") || 10
    );
    const search =
      searchParams.get("search") || "";
    const status =
      (searchParams.get("status") ||
        "") as EmployeeStatus | "";
    const department =
      searchParams.get("department") || "";
    const locationId = searchParams.get(
      "location_id"
    );

    const result = await getEmployees({
      page,
      limit,
      search,
      status,
      department,
      location_id: locationId
        ? Number(locationId)
        : undefined,
      managerLocationId: getManagerLocationId(
        user.role,
        user.location_id
      ),
    });

    return NextResponse.json({
      success: true,
      ...result,
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

    if (!canManageEmployees(user.role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const parsed =
      createEmployeeSchema.safeParse(body);

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

    const managerLocationId =
      getManagerLocationId(
        user.role,
        user.location_id
      );

    if (
      managerLocationId &&
      parsed.data.location_id !==
        managerLocationId
    ) {
      return forbiddenResponse(
        "Managers can only add employees to their own location"
      );
    }

    const codeExists =
      await employeeCodeExists(
        parsed.data.employee_code
      );

    if (codeExists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee code already exists",
        },
        { status: 409 }
      );
    }

    const employee = await createEmployee(
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        data: employee,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
