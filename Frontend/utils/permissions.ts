import { ROLE_MODULE_ACCESS } from "@/constants/permissions";
import { UserRole } from "@/types/roles";

export function hasPermission(
  role: string,
  module: string,
  permissions?: string[]
): boolean {
  if (permissions?.length) {
    return permissions.some(
      (code) =>
        code === `${module}.view` || code.startsWith(`${module}.`)
    );
  }

  const modules =
    ROLE_MODULE_ACCESS[role as UserRole];

  return modules?.includes(module) ?? false;
}

export function hasPermissionCode(
  permissions: string[] | undefined,
  code: string
): boolean {
  return permissions?.includes(code) ?? false;
}

export function canManageEmployees(role: string, permissions?: string[]) {
  return (
    hasPermissionAction(role, "employees", "create", permissions) ||
    hasPermissionAction(role, "employees", "edit", permissions)
  );
}

export function canManageLocations(role: string, permissions?: string[]) {
  return hasPermissionAction(role, "locations", "create", permissions);
}

export function canViewCameras(role: string, permissions?: string[]) {
  return hasPermission(role, "cameras", permissions);
}

export function canManageCameras(role: string, permissions?: string[]) {
  return hasPermissionAction(role, "cameras", "create", permissions);
}

export function canViewAttendance(role: string, permissions?: string[]) {
  return hasPermission(role, "attendance", permissions);
}

export function canManageAttendance(role: string, permissions?: string[]) {
  if (permissions?.length) {
    return permissions.some(
      (code) => code.startsWith("attendance.") && code.endsWith(".delete")
    );
  }

  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.ATTENDANCE_ADMIN ||
    role === UserRole.HR
  );
}

/** Delete any record (attendance, images, users, cameras, reports rows, etc.) — Super Admin only. */
export function canDeleteRecords(role: string): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export function canManageUsers(role: string, permissions?: string[]) {
  return hasPermission(role, "users", permissions);
}

export function canManageSettings(role: string, permissions?: string[]) {
  return hasPermissionAction(role, "settings", "edit", permissions);
}

export function canManageFaceRegistration(
  role: string,
  permissions?: string[]
) {
  if (permissions?.length) {
    return permissions.includes("face_registration.manage");
  }

  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.HR
  );
}

export function canPerformLiveFaceRegistration(options: {
  role: string;
  permissions?: string[];
  employeeId: number;
  userEmployeeId?: number | null;
  userLocationId?: number | null;
  employeeLocationId?: number | null;
}) {
  if (
    canAccessEmployeeFaceRegistration({
      ...options,
      manage: true,
    })
  ) {
    return true;
  }

  if (
    options.userEmployeeId === options.employeeId &&
    canViewFaceRegistration(options.role, options.permissions)
  ) {
    return true;
  }

  if (
    options.role === UserRole.MANAGER &&
    options.userLocationId &&
    options.userLocationId === options.employeeLocationId &&
    canViewFaceRegistration(options.role, options.permissions)
  ) {
    return true;
  }

  return false;
}

export function canViewFaceRegistration(
  role: string,
  permissions?: string[]
) {
  if (permissions?.length) {
    return permissions.includes("face_registration.view");
  }

  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.HR ||
    role === UserRole.MANAGER ||
    role === UserRole.EMPLOYEE
  );
}

export function canAccessEmployeeFaceRegistration(options: {
  role: string;
  permissions?: string[];
  employeeId: number;
  userEmployeeId?: number | null;
  userLocationId?: number | null;
  employeeLocationId?: number | null;
  manage?: boolean;
}) {
  if (options.manage) {
    return canManageFaceRegistration(options.role, options.permissions);
  }

  if (!canViewFaceRegistration(options.role, options.permissions)) {
    return false;
  }

  if (
    options.role === UserRole.SUPER_ADMIN ||
    options.role === UserRole.HR
  ) {
    return true;
  }

  if (options.role === UserRole.MANAGER) {
    return (
      !!options.userLocationId &&
      options.userLocationId === options.employeeLocationId
    );
  }

  if (options.role === UserRole.EMPLOYEE) {
    return options.userEmployeeId === options.employeeId;
  }

  return false;
}

export function hasPermissionAction(
  role: string,
  module: string,
  action: string,
  permissions?: string[]
): boolean {
  if (permissions?.length) {
    return permissions.includes(`${module}.${action}`);
  }

  if (role === UserRole.SUPER_ADMIN) return true;

  const moduleAccess = hasPermission(role, module);
  if (!moduleAccess) return false;

  if (action === "view") return true;

  if (module === "cameras" && action !== "view") {
    return role === UserRole.SUPER_ADMIN || role === UserRole.CAMERA_ADMIN;
  }

  if (module === "users") {
    return role === UserRole.SUPER_ADMIN;
  }

  if (module === "settings" && action === "edit") {
    return role === UserRole.SUPER_ADMIN;
  }

  if (module === "employees" && ["create", "delete"].includes(action)) {
    return role === UserRole.SUPER_ADMIN || role === UserRole.HR;
  }

  if (module === "locations" && action !== "view") {
    return role === UserRole.SUPER_ADMIN || role === UserRole.CAMERA_ADMIN;
  }

  return moduleAccess;
}

export const ROUTE_MODULE_MAP: Record<string, string> = {
  "/": "dashboard",
  "/employees": "employees",
  "/locations": "locations",
  "/cameras": "cameras",
  "/attendance": "attendance",
  "/reports": "reports",
  "/settings": "settings",
  "/users": "users",
  "/notifications": "notifications",
};

export function getModuleForPath(pathname: string): string | null {
  const match = Object.entries(ROUTE_MODULE_MAP).find(
    ([route]) =>
      pathname === route || pathname.startsWith(`${route}/`)
  );

  return match?.[1] ?? null;
}

export function getSidebarItems(
  role: UserRole,
  permissions?: string[]
) {
  const items = [
    { name: "Dashboard", path: "/", icon: "dashboard", module: "dashboard" },
    { name: "Employees", path: "/employees", icon: "employees", module: "employees" },
    { name: "Locations", path: "/locations", icon: "locations", module: "locations" },
    { name: "Cameras", path: "/cameras", icon: "cameras", module: "cameras" },
    { name: "Attendance", path: "/attendance", icon: "attendance", module: "attendance" },
    { name: "Reports", path: "/reports", icon: "reports", module: "reports" },
    { name: "Settings", path: "/settings", icon: "settings", module: "settings" },
    { name: "Users", path: "/users", icon: "users", module: "users" },
  ];

  return items.filter((item) =>
    hasPermission(role, item.module, permissions)
  );
}
