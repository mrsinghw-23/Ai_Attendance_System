"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Building2,
  Camera,
  LayoutDashboard,
  Menu,
  Settings,
  Shield,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { UserRole } from "@/types/roles";
import { getSidebarItems } from "@/utils/permissions";

const ICONS = {
  dashboard: LayoutDashboard,
  employees: Users,
  locations: Building2,
  cameras: Camera,
  attendance: BarChart3,
  reports: BarChart3,
  settings: Settings,
  users: UserCog,
};

type MobileNavProps = {
  role: UserRole;
  username?: string;
  permissions?: string[];
  variant?: "light" | "dark";
};

export default function MobileNav({
  role,
  username = "Admin",
  permissions,
  variant = "light",
}: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const items = getSidebarItems(role, permissions).map((item) => ({
    ...item,
    icon: ICONS[item.icon as keyof typeof ICONS] || LayoutDashboard,
  }));

  const isDark = variant === "dark";

  const menuButtonClass = isDark
    ? "flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 md:hidden"
    : "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 md:hidden";

  const drawer = open && mounted ? (
    <div className="fixed inset-0 z-[9998] md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
      />

      <aside
        className={`absolute left-0 top-0 flex h-full w-[min(85vw,320px)] flex-col border-r p-4 shadow-2xl ${
          isDark
            ? "border-white/10 bg-slate-950 text-white"
            : "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-2xl p-2 ${
                isDark
                  ? "border border-cyan-300/30 bg-cyan-400/10"
                  : "border border-cyan-200 bg-cyan-50 dark:border-cyan-300/30 dark:bg-cyan-400/10"
              }`}
            >
              <Shield size={20} />
            </div>
            <div>
              <p className="font-bold">AI Attendance</p>
              <p className="text-xs text-slate-400">Menu</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`rounded-xl p-2 ${
              isDark ? "hover:bg-white/10" : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.path ||
              (item.path !== "/" && pathname.startsWith(item.path));

            return (
              <Link
                key={item.name}
                href={item.path}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                  active
                    ? isDark
                      ? "border border-cyan-300/30 bg-gradient-to-r from-blue-600/90 to-violet-600/80 text-white"
                      : "border border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-300/30 dark:bg-gradient-to-r dark:from-blue-600/90 dark:to-violet-600/80 dark:text-white"
                    : isDark
                      ? "text-slate-300 hover:bg-white/10 hover:text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div
          className={`mt-4 flex items-center gap-3 rounded-2xl border p-3 ${
            isDark
              ? "border-white/10 bg-white/5"
              : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5"
          }`}
        >
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-bold text-white">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{username}</p>
            <p className="text-xs text-slate-400">{role.replace(/_/g, " ")}</p>
          </div>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={menuButtonClass}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
