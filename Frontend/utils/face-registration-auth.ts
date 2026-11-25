import { AuthUser, forbiddenResponse } from "@/utils/api-auth";
import pool from "@/lib/db";
import { canPerformLiveFaceRegistration } from "@/utils/permissions";

export async function getEmployeeLocation(employeeId: number) {
  const result = await pool.query(
    `SELECT location_id FROM employees WHERE id = $1`,
    [employeeId]
  );
  return (result.rows[0]?.location_id as number | null) ?? null;
}

export function assertLiveFaceRegistrationAccess(
  user: AuthUser,
  employeeId: number,
  employeeLocationId: number | null
) {
  const allowed = canPerformLiveFaceRegistration({
    role: user.role,
    permissions: user.permissions,
    employeeId,
    userEmployeeId: user.employee_id,
    userLocationId: user.location_id,
    employeeLocationId,
  });

  if (!allowed) {
    return forbiddenResponse(
      "You do not have permission to register faces for this employee"
    );
  }

  return null;
}
