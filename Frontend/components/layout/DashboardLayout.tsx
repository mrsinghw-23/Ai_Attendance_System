"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import NotificationCenter from "@/components/layout/NotificationCenter";
import UserProfileMenu from "@/components/layout/UserProfileMenu";
import { UserRole } from "@/types/roles";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissionGuard } from "@/hooks/usePermissionGuard";
import GateAttendanceRunner from "@/components/attendance/GateAttendanceRunner";

interface DashboardLayoutProps {
  title: string;
  module?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export default function DashboardLayout({
  title,
  module,
  children,
  actions,
}: DashboardLayoutProps) {
  const { user, loading } =
    useCurrentUser();

  usePermissionGuard(module);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      window.location.href = "/login";
    } catch (error) {
      console.error(error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-500">
          Loading...
        </div>
      </div>
    );
  }

  const currentRole =
    (user?.role as UserRole) ||
    UserRole.EMPLOYEE;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex">
      <GateAttendanceRunner />
      <Sidebar
        role={currentRole}
        username={user?.username}
        permissions={user?.permissions}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 overflow-visible border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 md:px-6 md:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <MobileNav
              role={currentRole}
              username={user?.username}
              permissions={user?.permissions}
            />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white sm:text-2xl">
                {title}
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                Welcome back, {user?.username}
              </p>
            </div>
          </div>

          <div className="relative z-50 flex shrink-0 items-center gap-2 overflow-visible sm:gap-3">
            {actions}
            <NotificationCenter />
            <UserProfileMenu username={user?.username || "User"} />
            <button
              onClick={handleLogout}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 sm:px-4"
            >
              Logout
            </button>
          </div>
        </header>

        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 p-4 md:p-6 overflow-auto"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
