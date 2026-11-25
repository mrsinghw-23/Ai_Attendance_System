"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@/types/roles";
import { hasPermission } from "@/utils/permissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function usePermissionGuard(module?: string) {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (loading || !module) {
      return;
    }

    if (
      !user ||
      !hasPermission(
        user.role as UserRole,
        module,
        user.permissions
      )
    ) {
      router.replace("/login");
    }
  }, [user, loading, module, router]);
}
