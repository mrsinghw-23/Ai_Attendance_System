export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  HR = "HR",
  MANAGER = "MANAGER",
  ATTENDANCE_ADMIN = "ATTENDANCE_ADMIN",
  CAMERA_ADMIN = "CAMERA_ADMIN",
  EMPLOYEE = "EMPLOYEE",
  VIEWER = "VIEWER",
}

export const ALL_ROLES = Object.values(UserRole);

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.HR]: "HR",
  [UserRole.MANAGER]: "Manager",
  [UserRole.ATTENDANCE_ADMIN]: "Attendance Admin",
  [UserRole.CAMERA_ADMIN]: "Camera Admin",
  [UserRole.EMPLOYEE]: "Employee",
  [UserRole.VIEWER]: "Viewer",
};
