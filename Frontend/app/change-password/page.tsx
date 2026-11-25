"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await response.json();
      setMessage(data.message || "Request processed.");

      if (data.success) {
        setTimeout(() => router.push("/"), 1200);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030814] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_80%,rgba(14,165,233,0.18),transparent_38%)]" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg items-center px-6 py-10">
        <form
          onSubmit={submit}
          className="w-full rounded-[2rem] border border-cyan-400/45 bg-[#071126]/76 px-8 py-10 shadow-[0_0_70px_rgba(14,165,233,0.28)] backdrop-blur-2xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <ShieldCheck className="text-cyan-300" size={28} />
            <div>
              <h1 className="text-2xl font-black">Change Password</h1>
              <p className="text-sm text-slate-300">
                You must change your password before continuing.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-slate-950/35 px-5 py-4">
              <LockKeyhole className="text-slate-300" size={20} />
              <input
                type="password"
                className="w-full bg-transparent text-white outline-none placeholder:text-slate-400"
                placeholder="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>

            <label className="flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-slate-950/35 px-5 py-4">
              <LockKeyhole className="text-slate-300" size={20} />
              <input
                type="password"
                className="w-full bg-transparent text-white outline-none placeholder:text-slate-400"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>

            <label className="flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-slate-950/35 px-5 py-4">
              <LockKeyhole className="text-slate-300" size={20} />
              <input
                type="password"
                className="w-full bg-transparent text-white outline-none placeholder:text-slate-400"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
          </div>

          {message && (
            <p className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 py-4 font-bold uppercase text-white disabled:opacity-60"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </main>
  );
}
