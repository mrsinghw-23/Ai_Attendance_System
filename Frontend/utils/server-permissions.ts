import { NextRequest } from "next/server";
import {
  hasModuleAccess,
  hasPermissionAction,
} from "@/services/permission.service";

export async function canManageUsersAsync(
  role: string,
  userId?: number
) {
  return hasModuleAccess(role, "users", userId);
}

export async function canManageUsersActionAsync(
  role: string,
  action: string,
  userId?: number
) {
  return hasPermissionAction(role, "users", action, userId);
}

export async function canAccessModuleAsync(
  role: string,
  module: string,
  userId?: number
) {
  return hasModuleAccess(role, module, userId);
}

export async function authorizeModule(
  role: string,
  module: string,
  userId?: number
) {
  const allowed = await canAccessModuleAsync(role, module, userId);
  return allowed;
}

export function getRequestMeta(request?: NextRequest) {
  if (!request) {
    return { ipAddress: null, userAgent: null };
  }

  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null,
    userAgent: request.headers.get("user-agent"),
  };
}
