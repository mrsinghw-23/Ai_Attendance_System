"use client";

import AIOperationsCenter from "@/components/dashboard/AIOperationsCenter";
import { UserRole } from "@/types/roles";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function Home() {
  const { user, loading } =
  useCurrentUser();

if (loading) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-3xl bg-cyan-400/20 shadow-[0_0_60px_rgba(34,211,238,0.45)]" />
        <p className="text-sm text-cyan-100">
          Initializing AI Operations Center...
        </p>
      </div>
    </div>
  );
}

const currentRole =
  (user?.role as UserRole) ||
  UserRole.EMPLOYEE;

async function handleLogout() {
  try {
    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );

    window.location.href =
      "/login";
  } catch (error) {
    console.error(error);
  }
}

  return (
    <AIOperationsCenter
      user={user}
      role={currentRole}
      onLogout={handleLogout}
    />
  );
}