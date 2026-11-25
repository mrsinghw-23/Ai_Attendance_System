import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/types/roles";
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/utils/api-auth";
import { canDeleteRecords, canManageEmployees } from "@/utils/permissions";
import {
  updateEmployeeSchema,
} from "@/schemas/employee.schema";
import {
  deleteEmployee,
  employeeCodeExists,
  getEmployeeById,
  updateEmployee,
} from "@/services/employee.service";

function getManagerLocationId(
  role: string,
  locationId: number | null
) {
  if (role === UserRole.MANAGER) {
    return locationId;
  }

  return null;
}

interface RouteContext {
  params: Promise<{ id: string }>;
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

    if (!canManageEmployees(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const employeeId = Number(id);

    if (Number.isNaN(employeeId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid employee ID",
        },
        { status: 400 }
      );
    }

    const employee = await getEmployeeById(
      employeeId,
      getManagerLocationId(
        user.role,
        user.location_id
      )
    );

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          message: "Employee not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: employee,
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

    if (!canManageEmployees(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await context.params;
    const employeeId = Number(id);

    if (Number.isNaN(employeeId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid employee ID",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed =
      updateEmployeeSchema.safeParse(body);

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
      parsed.data.location_id !== undefined &&
      parsed.data.location_id !==
        managerLocationId
    ) {
      return forbiddenResponse(
        "Managers can only assign employees to their own location"
      );
    }

    if (parsed.data.employee_code) {
      const codeExists =
        await employeeCodeExists(
          parsed.data.employee_code,
          employeeId
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
    }

    const employee = await updateEmployee(
      employeeId,
      parsed.data,
      managerLocationId
    );

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          message: "Employee not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: employee,
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
    const employeeId = Number(id);

    if (Number.isNaN(employeeId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid employee ID",
        },
        { status: 400 }
      );
    }

    const deleted = await deleteEmployee(
      employeeId,
      getManagerLocationId(
        user.role,
        user.location_id
      )
    );

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          message: "Employee not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return serverErrorResponse();
  }
}
