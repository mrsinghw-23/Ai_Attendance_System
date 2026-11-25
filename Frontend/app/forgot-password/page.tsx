"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setResetUrl("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await response.json();
      setMessage(data.message || "Request processed.");
      if (data.resetUrl) setResetUrl(data.resetUrl);
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
              <h1 className="text-2xl font-black">Forgot Password</h1>
              <p className="text-sm text-slate-300">
                Enter your username or email to reset your password.
              </p>
            </div>
          </div>

          <label className="mb-4 flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-slate-950/35 px-5 py-4">
            <LockKeyhole className="text-slate-300" size={20} />
            <input
              className="w-full bg-transparent text-white outline-none placeholder:text-slate-400"
              placeholder="Username or Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </label>

          {message && (
            <p className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {message}
            </p>
          )}

          {resetUrl && (
            <p className="mb-4 break-all rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100">
              Dev reset link:{" "}
              <Link href={resetUrl.replace(/^https?:\/\/[^/]+/, "")} className="underline">
                {resetUrl}
              </Link>
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 py-4 font-bold uppercase text-white disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>

          <Link
            href="/login"
            className="mt-5 inline-flex items-center gap-2 text-sm text-cyan-300 hover:underline"
          >
            <ArrowLeft size={16} />
            Back to Login
          </Link>
        </form>
      </div>
    </main>
  );
}
