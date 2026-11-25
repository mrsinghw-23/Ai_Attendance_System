"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  User,
} from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeLabel = useMemo(
    () =>
      now
        ? now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "--:--",
    [now]
  );

  const dateLabel = useMemo(
    () =>
      now
        ? now.toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Loading",
    [now]
  );

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("token", data.token);
        window.location.href = data.redirectTo || "/";
      } else {
        alert(data.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030814] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_80%,rgba(14,165,233,0.18),transparent_38%),radial-gradient(circle_at_82%_20%,rgba(34,211,238,0.14),transparent_34%)]" />

      <section className="relative z-10 grid min-h-screen grid-cols-1 gap-8 px-6 py-5 lg:grid-cols-[1fr_500px] lg:px-8">
        <div className="hidden min-h-[680px] flex-col lg:flex">
          <header>
            <h1 className="text-4xl font-black tracking-wide">
              <span className="text-cyan-400">EBH</span>{" "}
              <span className="text-white">AI VISIONS</span>
            </h1>
            <p className="mt-1 text-sm uppercase tracking-[0.28em] text-slate-300">
              AI Attendance System
            </p>
          </header>

          <div className="relative mt-8 flex-1 overflow-hidden rounded-[1.75rem] border border-cyan-400/15 bg-[#071020]/35 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <img
              src="/ebh-login-camera.png"
              alt="EBH AI Vision CCTV"
              className="absolute inset-0 h-full w-full object-cover object-left"
              style={{
                filter: "contrast(1.1) saturate(1.15) brightness(1.04)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#030814]/55" />
          </div>
        </div>

        <div className="flex flex-col">
          <header className="mb-8 flex items-start justify-end gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.35)]">
              <ShieldCheck size={24} />
            </div>
            <div className="text-right">
              <p className="text-lg font-black uppercase tracking-wide">
                <span className="text-cyan-400">EBH</span> Attendance System
              </p>
              <p className="text-xs text-slate-300">
                AI-Powered | Smart Monitoring | Secure System
              </p>
            </div>
          </header>

          <div className="flex flex-1 items-center justify-center">
            <form
              onSubmit={login}
              className="w-full max-w-[450px] rounded-[2rem] border border-cyan-400/45 bg-[#071126]/76 px-8 py-10 shadow-[0_0_70px_rgba(14,165,233,0.28),inset_0_0_40px_rgba(14,165,233,0.08)] backdrop-blur-2xl"
            >
              <div className="mx-auto mb-7 grid h-24 w-24 place-items-center rounded-3xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_42px_rgba(34,211,238,0.28)]">
                <div className="relative">
                  <ShieldCheck size={58} />
                  <Camera
                    size={24}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                </div>
              </div>

              <div className="mb-8 text-center">
                <h2 className="text-4xl font-black uppercase tracking-tight">
                  Welcome{" "}
                  <span className="bg-gradient-to-r from-cyan-300 to-blue-500 bg-clip-text text-transparent">
                    Back
                  </span>
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  AI-Powered Attendance &amp; Surveillance System
                </p>
              </div>

              <div className="space-y-4">
                <label
                  htmlFor="username"
                  className="flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-slate-950/35 px-5 py-4 transition focus-within:border-cyan-300/60 focus-within:shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                >
                  <User className="text-slate-300" size={22} />
                  <input
                    id="username"
                    className="w-full bg-transparent text-lg text-white outline-none placeholder:text-slate-400"
                    placeholder="Username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>

                <label
                  htmlFor="password"
                  className="flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-slate-950/35 px-5 py-4 transition focus-within:border-cyan-300/60 focus-within:shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                >
                  <LockKeyhole className="text-slate-300" size={22} />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="w-full bg-transparent text-lg text-white outline-none placeholder:text-slate-400"
                    placeholder="Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-slate-400 transition hover:text-cyan-300"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </label>

                <div className="flex justify-end">
                  <a
                    href="/forgot-password"
                    className="text-sm text-cyan-300 transition hover:text-cyan-200 hover:underline"
                  >
                    Forgot Password?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 py-4 text-xl font-bold uppercase text-white shadow-[0_0_36px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Logging in..." : "Login"}
                  <ArrowRight size={24} />
                </button>
              </div>

              <div className="my-6 flex items-center gap-4 text-sm uppercase text-slate-400">
                <span className="h-px flex-1 bg-cyan-400/15" />
                Or
                <span className="h-px flex-1 bg-cyan-400/15" />
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-cyan-400/25 bg-slate-950/20 py-4 text-base text-white transition hover:border-cyan-300/50"
              >
                <Fingerprint className="text-cyan-300" size={24} />
                Login with Secure Key
              </button>

              <div className="mt-6 grid grid-cols-3 rounded-xl border border-cyan-400/10 bg-slate-950/25 px-4 py-3 text-xs text-slate-300">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-emerald-400" />
                    <span>System Status</span>
                  </div>
                  <p className="mt-1 font-semibold text-emerald-400">
                    All Systems Operational
                  </p>
                </div>
                <div className="border-x border-cyan-400/10 text-center">
                  <p className="font-semibold text-white">{timeLabel}</p>
                  <p className="mt-1">{dateLabel}</p>
                </div>
                <div className="text-right">
                  <p>Active Cameras</p>
                  <p className="mt-1 font-semibold text-emerald-400">
                    24 / 24 Online
                  </p>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
