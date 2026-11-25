"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  Camera,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import { useState } from "react";
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

interface SidebarProps {
  role: UserRole;
  username?: string;
  permissions?: string[];
}

export default function Sidebar({
  role,
  username = "Admin",
  permissions,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const items = getSidebarItems(role, permissions).map((item) => ({
    ...item,
    icon: ICONS[item.icon as keyof typeof ICONS] || LayoutDashboard,
  }));

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`hidden md:flex min-h-screen shrink-0 flex-col border-r border-cyan-400/10 bg-slate-950/60 text-white shadow-2xl shadow-blue-950/40 backdrop-blur-2xl transition-[width] duration-300 ${
        collapsed ? "w-24 p-4" : "w-72 p-5"
      }`}
    >
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative mb-8 flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-2 shadow-lg shadow-cyan-500/20">
            <Shield size={22} />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-xl font-bold">AI Attendance</h1>
              <p className="text-xs text-slate-400">Enterprise SaaS</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed((value) => !value)}
            className="ml-auto rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.path ||
            (item.path !== "/" && pathname.startsWith(item.path));

          return (
            <li key={item.name}>
              <Link
                href={item.path}
                className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl p-3 transition ${
                  active
                    ? "border border-cyan-300/30 bg-gradient-to-r from-blue-600/90 to-violet-600/80 text-white shadow-lg shadow-blue-600/25"
                    : "border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/10 hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="active-sidebar-item"
                    className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(34,211,238,0.32),transparent_35%)]"
                  />
                )}
                <Icon
                  size={18}
                  className="relative z-10 transition group-hover:scale-110"
                />
                {!collapsed && (
                  <span className="relative z-10 flex-1">{item.name}</span>
                )}
                {!collapsed && item.name === "Reports" && (
                  <span className="relative z-10 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] text-fuchsia-200">
                    Live
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 space-y-3 border-t border-white/10 pt-5">
        <div
          className={`rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-xs text-emerald-200 ${
            collapsed ? "text-center" : ""
          }`}
        >
          <div className="font-semibold text-emerald-300">
            {collapsed ? "OK" : "All Systems Operational"}
          </div>
          {!collapsed && (
            <p className="mt-1 text-emerald-200/70">
              RBAC, cameras, attendance and AI pipeline ready.
            </p>
          )}
        </div>
        <div
          className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-bold">
            {username.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{username}</p>
              <p className="text-xs text-slate-400">
                {role.replace(/_/g, " ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
