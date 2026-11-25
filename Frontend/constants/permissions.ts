import { UserRole } from "@/types/roles";

/** Fallback module access when DB permissions are unavailable (client-side). */
export const ROLE_MODULE_ACCESS: Record<UserRole, string[]> = {
  [UserRole.SUPER_ADMIN]: [
    "dashboard",
    "employees",
    "locations",
    "cameras",
    "attendance",
    "reports",
    "settings",
    "users",
    "notifications",
    "audit_logs",
  ],
  [UserRole.HR]: [
    "dashboard",
    "employees",
    "locations",
    "attendance",
    "reports",
    "notifications",
  ],
  [UserRole.MANAGER]: [
    "dashboard",
    "employees",
    "cameras",
    "attendance",
    "reports",
  ],
  [UserRole.ATTENDANCE_ADMIN]: [
    "dashboard",
    "attendance",
    "reports",
  ],
  [UserRole.CAMERA_ADMIN]: [
    "dashboard",
    "cameras",
    "locations",
  ],
  [UserRole.EMPLOYEE]: ["attendance"],
  [UserRole.VIEWER]: [
    "dashboard",
    "employees",
    "locations",
    "cameras",
    "attendance",
    "reports",
  ],
};

/** @deprecated Use DB permissions via permission.service on server. */
export const ROLE_PERMISSIONS = ROLE_MODULE_ACCESS;

export const PERMISSION_MODULES = [
  "dashboard",
  "employees",
  "locations",
  "cameras",
  "attendance",
  "reports",
  "users",
  "settings",
  "notifications",
  "audit_logs",
] as const;

export const PERMISSION_ACTIONS: Record<string, string[]> = {
  dashboard: ["view"],
  employees: ["view", "create", "edit", "delete"],
  locations: ["view", "create", "edit", "delete"],
  cameras: ["view", "create", "edit", "delete"],
  attendance: ["view", "edit", "approve"],
  reports: ["view", "export"],
  users: ["view", "create", "edit", "delete", "reset_password"],
  settings: ["view", "edit"],
  notifications: ["view", "manage"],
  audit_logs: ["view"],
};
