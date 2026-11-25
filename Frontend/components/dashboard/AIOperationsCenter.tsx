"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Camera,
  CheckCircle2,
  Clock3,
  KeyRound,
  LogOut,
  Maximize2,
  Minimize2,
  Radar,
  ShieldCheck,
  ScanFace,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import NotificationCenter from "@/components/layout/NotificationCenter";
import UserProfileMenu from "@/components/layout/UserProfileMenu";
import { ConfirmModal } from "@/components/ui/Modal";
import { canManageAttendance } from "@/utils/permissions";
import { formatDurationMinutes } from "@/utils/duration-format";
import { useToast } from "@/providers/ToastProvider";
import { UserRole } from "@/types/roles";
import { CurrentUser } from "@/hooks/useCurrentUser";
import { UserStats } from "@/types/admin";
import { DashboardOverview, DashboardDetailResult, DashboardDetailType } from "@/types/dashboard";
import { AIRecognitionDashboard } from "@/types/ai-recognition";
import DashboardDetailModal from "@/components/dashboard/DashboardDetailModal";
import CctvLiveImage, {
  type CameraStreamStatus,
} from "@/components/cameras/CctvLiveImage";
import PcWebcamFeed from "@/components/cameras/PcWebcamFeed";
import { usePcWebcamConfig } from "@/hooks/usePcWebcamConfig";
import type { CameraStreamInput } from "@/utils/camera-stream";
import LiveAttendanceScanner, {
  type GateScanReport,
  type LiveMarkResult,
  type LiveScanPhase,
  type LiveAttendanceScannerHandle,
} from "@/components/attendance/LiveAttendanceScanner";

interface AIOperationsCenterProps {
  user: CurrentUser | null;
  role: UserRole;
  onLogout: () => Promise<void>;
}

const EMPTY_OVERVIEW: DashboardOverview = {
  employees: { total: 0 },
  attendance_today: { present: 0, late: 0, absent: 0, half_day: 0 },
  cameras: { total: 0, online: 0, offline: 0, items: [] },
  locations: [],
  weekly_trend: [],
  monthly_breakdown: [
    { name: "Present", value: 0, color: "#22c55e" },
    { name: "Half Day", value: 0, color: "#f59e0b" },
    { name: "Absent", value: 0, color: "#f43f5e" },
  ],
  attendance_rate: 0,
  recent_activity: [],
  primary_camera: null,
  face_registration: {
    registered: 0,
    pending: 0,
    partially_registered: 0,
    registration_percentage: 0,
  },
};

export default function AIOperationsCenter({
  user,
  role,
  onLogout,
}: AIOperationsCenterProps) {
  const [now, setNow] = useState(new Date());
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [overview, setOverview] = useState<DashboardOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DashboardDetailResult | null>(null);
  const [detailType, setDetailType] = useState<DashboardDetailType | null>(null);
  const [recognition, setRecognition] = useState<AIRecognitionDashboard | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"day" | "week" | "month">("week");
  const [quickDeleteTarget, setQuickDeleteTarget] = useState<
    "faces_detected" | "faces_recognized" | null
  >(null);
  const [quickDeleting, setQuickDeleting] = useState(false);
  const { showToast } = useToast();
  const canManage = canManageAttendance(role, user?.permissions);

  const openDetail = (type: DashboardDetailType) => {
    setDetailType(type);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);

    fetch(`/api/dashboard/details?type=${type}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDetail(data.data);
      })
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  };

  const refreshDetail = () => {
    if (detailType) {
      openDetail(detailType);
    }
    refreshRecognitionStats();
    fetch(`/api/dashboard/overview?period=${chartPeriod}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setOverview(data.data);
      })
      .catch(console.error);
  };

  const refreshRecognitionStats = () => {
    fetch("/api/ai/dashboard")
      .then(async (res) => {
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.success) setRecognition(data.data);
      })
      .catch(console.error);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
  };

  async function confirmQuickDelete() {
    if (!quickDeleteTarget) return;
    setQuickDeleting(true);

    let response: Response;
    response = await fetch("/api/ai/face-events/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_all",
        scope: quickDeleteTarget === "faces_recognized" ? "recognized" : "detected",
      }),
    });

    const data = await response.json();
    if (data.success) {
      showToast(data.message || "Data deleted", "success");
      setQuickDeleteTarget(null);
      refreshRecognitionStats();
      fetch(`/api/dashboard/overview?period=${chartPeriod}`)
        .then((res) => res.json())
        .then((payload) => {
          if (payload.success) setOverview(payload.data);
        })
        .catch(console.error);
    } else {
      showToast(data.message || "Delete failed", "error");
    }

    setQuickDeleting(false);
  }

  function quickDeleteMessage() {
    switch (quickDeleteTarget) {
      case "faces_detected":
        return "Delete all face detection scan records for today? Attendance already marked will stay.";
      case "faces_recognized":
        return "Delete all face recognition scan records for today? Attendance already marked will stay.";
      default:
        return "";
    }
  }

  function quickDeleteTitle() {
    switch (quickDeleteTarget) {
      case "faces_detected":
        return "Delete Faces Detected Data";
      case "faces_recognized":
        return "Delete Faces Recognized Data";
      default:
        return "Delete Data";
    }
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function loadOverview() {
      fetch(`/api/dashboard/overview?period=${chartPeriod}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setOverview(data.data);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }

    setLoading(true);
    loadOverview();
    fetch("/api/cameras/health", { method: "POST" })
      .then(() => loadOverview())
      .catch(() => {});

    const timer = setInterval(loadOverview, 30000);
    return () => clearInterval(timer);
  }, [chartPeriod]);

  useEffect(() => {
    function loadRecognition() {
      fetch("/api/ai/dashboard")
        .then(async (res) => {
          if (!res.ok) return null;
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) return null;
          return res.json();
        })
        .then((data) => {
          if (data?.success) setRecognition(data.data);
        })
        .catch(console.error);
    }

    loadRecognition();
    const timer = setInterval(loadRecognition, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (role !== UserRole.SUPER_ADMIN) return;

    fetch("/api/users/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setUserStats(data.data);
      })
      .catch(console.error);
  }, [role]);

  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [now]
  );

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [now]
  );

  const hasWeeklyData = overview.weekly_trend.some(
    (item) => item.present > 0 || item.late > 0
  );
  const hasMonthlyData = overview.monthly_breakdown.some(
    (item) => item.value > 0
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#030712] text-white">
      <CyberBackground />
      <div className="relative z-10 flex min-h-screen">
        <Sidebar role={role} username={user?.username} permissions={user?.permissions} />

        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">
          <TopCommandBar
            username={user?.username || "Admin"}
            time={timeLabel}
            onLogout={onLogout}
            role={role}
            permissions={user?.permissions}
          />

          <section className="mt-6 grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <HeroPanel
                username={user?.username || "Admin"}
                date={dateLabel}
                time={timeLabel}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <MetricCard
                  label="Total Employees"
                  value={overview.employees.total}
                  subtitle={`${overview.locations.length} location${overview.locations.length === 1 ? "" : "s"} · Click for list`}
                  icon={<Users size={20} />}
                  tone="cyan"
                  delay={0.05}
                  loading={loading}
                  onClick={() => openDetail("total_employees")}
                />
                <MetricCard
                  label="Present Today"
                  value={overview.attendance_today.present}
                  subtitle={
                    overview.attendance_today.present === 0
                      ? "No check-ins yet · Click for list"
                      : "Checked in today · Click for list"
                  }
                  icon={<CheckCircle2 size={20} />}
                  tone="emerald"
                  delay={0.1}
                  loading={loading}
                  onClick={() => openDetail("present")}
                />
                <MetricCard
                  label="Late Employees"
                  value={overview.attendance_today.late}
                  subtitle={
                    overview.attendance_today.late === 0
                      ? "No late arrivals · Click for list"
                      : "Late today · Click for list"
                  }
                  icon={<Clock3 size={20} />}
                  tone="amber"
                  delay={0.15}
                  loading={loading}
                  onClick={() => openDetail("late")}
                />
                <MetricCard
                  label="Absent Today"
                  value={overview.attendance_today.absent}
                  subtitle={
                    overview.attendance_today.absent === 0
                      ? "No absences recorded · Click for list"
                      : "Absent today · Click for list"
                  }
                  icon={<Users size={20} />}
                  tone="rose"
                  delay={0.16}
                  loading={loading}
                  onClick={() => openDetail("absent")}
                />
                <MetricCard
                  label="Half Day"
                  value={overview.attendance_today.half_day}
                  subtitle={
                    overview.attendance_today.half_day === 0
                      ? "No half-day records · Click for list"
                      : "Half day today · Click for list"
                  }
                  icon={<Clock3 size={20} />}
                  tone="violet"
                  delay={0.17}
                  loading={loading}
                  onClick={() => openDetail("half_day")}
                />
                <MetricCard
                  label="Active Cameras"
                  value={overview.cameras.online}
                  subtitle={`${overview.cameras.total} total · ${overview.cameras.offline} offline · Click for list`}
                  icon={<Camera size={20} />}
                  tone="violet"
                  delay={0.2}
                  loading={loading}
                  onClick={() => openDetail("cameras")}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCardStack
                  showDelete={canManage}
                  deleteLabel="Delete today's scans"
                  onDelete={() => setQuickDeleteTarget("faces_detected")}
                >
                  <MetricCard
                    label="Faces Detected"
                    value={recognition?.faces_detected ?? 0}
                    subtitle={
                      recognition?.faces_detected_total &&
                      recognition.faces_detected_total > (recognition?.faces_detected ?? 0)
                        ? `${recognition.faces_detected_total} total scans · Click to manage`
                        : "Unique today · Click to manage"
                    }
                    icon={<Radar size={20} />}
                    tone="cyan"
                    delay={0.26}
                    loading={!recognition}
                    onClick={() => openDetail("faces_detected")}
                  />
                </MetricCardStack>
                <MetricCardStack
                  showDelete={canManage}
                  deleteLabel="Delete today's scans"
                  onDelete={() => setQuickDeleteTarget("faces_recognized")}
                >
                  <MetricCard
                    label="Faces Recognized"
                    value={recognition?.faces_recognized ?? 0}
                    subtitle={
                      recognition?.faces_recognized_total &&
                      recognition.faces_recognized_total > (recognition?.faces_recognized ?? 0)
                        ? `${recognition.faces_recognized_total} total scans · Click to manage`
                        : `${recognition?.embeddings_count ?? 0} embeddings · Click to manage`
                    }
                    icon={<ScanFace size={20} />}
                    tone="emerald"
                    delay={0.27}
                    loading={!recognition}
                    onClick={() => openDetail("faces_recognized")}
                  />
                </MetricCardStack>
                <MetricCard
                  label="AI Active Cameras"
                  value={recognition?.active_cameras ?? overview.cameras.online}
                  subtitle={`${recognition?.total_cameras ?? overview.cameras.total} configured · Click for list`}
                  icon={<Camera size={20} />}
                  tone="cyan"
                  delay={0.3}
                  loading={!recognition}
                  onClick={() => openDetail("cameras")}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetricCard
                  label="AI Ready"
                  value={overview.face_registration.registered}
                  subtitle={`${overview.face_registration.registration_percentage}% · Click for list`}
                  icon={<ScanFace size={20} />}
                  tone="emerald"
                  delay={0.23}
                  loading={loading}
                  onClick={() => openDetail("face_registered")}
                />
                <MetricCard
                  label="Pending Registration"
                  value={overview.face_registration.pending}
                  subtitle="Not registered · Click for list"
                  icon={<ScanFace size={20} />}
                  tone="amber"
                  delay={0.24}
                  loading={loading}
                  onClick={() => openDetail("face_pending")}
                />
              </div>

              {role === UserRole.SUPER_ADMIN && userStats && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <MetricCard
                      label="Total Users"
                      value={userStats.total_users}
                      subtitle="System accounts · Click for list"
                      icon={<Users size={20} />}
                      tone="cyan"
                      delay={0.22}
                      onClick={() => openDetail("users_all")}
                    />
                    <MetricCard
                      label="Active Users"
                      value={userStats.active_users}
                      subtitle="Enabled accounts · Click for list"
                      icon={<CheckCircle2 size={20} />}
                      tone="emerald"
                      delay={0.24}
                      onClick={() => openDetail("users_active")}
                    />
                    <MetricCard
                      label="Disabled Users"
                      value={userStats.disabled_users}
                      subtitle="Inactive accounts · Click for list"
                      icon={<Clock3 size={20} />}
                      tone="amber"
                      delay={0.26}
                      onClick={() => openDetail("users_disabled")}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href="/users"
                      className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                    >
                      <UserPlus size={16} />
                      Create User
                    </a>
                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <GlassPanel title="Recent Logins">
                      {userStats.recent_logins.length === 0 ? (
                        <EmptyState message="No login history yet." />
                      ) : (
                        <div className="space-y-3">
                          {userStats.recent_logins.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                            >
                              <p className="font-medium">{entry.username || "Unknown"}</p>
                              <p className="text-xs text-slate-400">
                                {entry.browser} · {entry.device} ·{" "}
                                {new Date(entry.created_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassPanel>

                    <GlassPanel title="Recent Password Resets">
                      {userStats.recent_password_resets.length === 0 ? (
                        <EmptyState message="No password resets yet." />
                      ) : (
                        <div className="space-y-3">
                          {userStats.recent_password_resets.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <KeyRound size={14} className="text-amber-300" />
                                <p className="font-medium">{entry.username || "Unknown"}</p>
                              </div>
                              <p className="text-xs text-slate-400">
                                {new Date(entry.created_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassPanel>
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <GlassPanel
                  title="Attendance Overview"
                  action={
                    <div className="flex gap-2 text-xs">
                      {(["day", "week", "month"] as const).map((period) => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setChartPeriod(period)}
                          className={`rounded-lg px-2 py-1 capitalize ${
                            chartPeriod === period
                              ? "bg-cyan-500/20 text-cyan-200"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {hasWeeklyData ? (
                    <ChartFrame>
                      <AreaChart data={overview.weekly_trend}>
                        <defs>
                          <linearGradient id="presentFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="alertFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis dataKey="day" stroke="#64748b" />
                        <YAxis stroke="#64748b" allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: "rgba(15,23,42,0.92)",
                            border: "1px solid rgba(34,211,238,0.2)",
                            borderRadius: 14,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="present"
                          stroke="#22c55e"
                          fill="url(#presentFill)"
                          strokeWidth={3}
                        />
                        <Area
                          type="monotone"
                          dataKey="late"
                          stroke="#f43f5e"
                          fill="url(#alertFill)"
                          strokeWidth={3}
                        />
                      </AreaChart>
                    </ChartFrame>
                  ) : (
                    <EmptyState message="No Data Available" />
                  )}
                </GlassPanel>

                <GlassPanel title="Monthly Attendance" action="This Month">
                  {hasMonthlyData ? (
                    <div className="grid min-h-[350px] min-w-0 grid-cols-1 items-center gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_120px]">
                      <ChartFrame>
                        <PieChart>
                          <Pie
                            data={overview.monthly_breakdown}
                            dataKey="value"
                            innerRadius={74}
                            outerRadius={104}
                            paddingAngle={3}
                          >
                            {overview.monthly_breakdown.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartFrame>
                      <div className="space-y-4">
                        <div>
                          <p className="text-4xl font-black">{overview.attendance_rate}%</p>
                          <p className="text-xs text-slate-400">Attendance Rate</p>
                        </div>
                        {overview.monthly_breakdown.map((item) => (
                          <div key={item.name} className="flex items-center gap-2 text-xs">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: item.color }}
                            />
                            <span className="text-slate-300">{item.name}</span>
                            <span className="ml-auto text-slate-500">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState message="No Data Available" />
                  )}
                </GlassPanel>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <LocationOverview
                  locations={overview.locations}
                  onViewAll={() => openDetail("locations_overview")}
                />
                <CameraStatusPanel
                  cameras={overview.cameras.items}
                  onViewAll={() => openDetail("cameras")}
                />
                <SystemHealth
                  onlineCameras={overview.cameras.online}
                  totalCameras={overview.cameras.total}
                />
              </div>
            </div>

            <aside className="space-y-5">
              <AICameraMonitor
                cameras={overview.cameras.items}
                primaryCamera={overview.primary_camera}
              />
              <LiveActivityFeed
                activities={overview.recent_activity}
                onViewAll={() => openDetail("recent_activity")}
              />
            </aside>
          </section>

          <DashboardDetailModal
            open={detailOpen}
            loading={detailLoading}
            detail={detail}
            onClose={closeDetail}
            onRefresh={refreshDetail}
            onStatsRefresh={refreshRecognitionStats}
            userRole={role}
            userPermissions={user?.permissions}
          />

          <ConfirmModal
            open={!!quickDeleteTarget}
            title={quickDeleteTitle()}
            message={quickDeleteMessage()}
            confirmLabel="Delete"
            loading={quickDeleting}
            onConfirm={() => void confirmQuickDelete()}
            onClose={() => !quickDeleting && setQuickDeleteTarget(null)}
          />
        </main>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}

function TopCommandBar({
  username,
  time,
  onLogout,
  role,
  permissions,
}: {
  username: string;
  time: string;
  onLogout: () => Promise<void>;
  role: UserRole;
  permissions?: string[];
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-40 flex flex-wrap items-center justify-between gap-3 overflow-visible rounded-3xl border border-white/10 bg-white/[0.04] px-3 py-3 shadow-2xl shadow-blue-950/20 backdrop-blur-2xl sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav
          role={role}
          username={username}
          permissions={permissions}
          variant="dark"
        />
        <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-400 lg:flex">
          <Sparkles size={15} className="text-cyan-300" />
          <span>Search anything...</span>
          <span className="ml-24 text-xs">⌘K</span>
        </div>
      </div>

      <div className="relative z-50 ml-auto flex items-center gap-2 overflow-visible sm:gap-3">
        <div className="hidden min-[420px]:block rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 font-mono text-xs text-cyan-200 sm:px-4 sm:text-sm">
          {time}
        </div>
        <NotificationCenter variant="dark" />
        <UserProfileMenu username={username} variant="dark" />
        <button
          onClick={onLogout}
          className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-2.5 text-rose-200 transition hover:bg-rose-500/20 sm:p-3"
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={17} />
        </button>
      </div>
    </motion.header>
  );
}

function HeroPanel({
  username,
  date,
  time,
}: {
  username: string;
  date: string;
  time: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(30,41,59,0.28))] p-6 shadow-2xl shadow-blue-950/30 backdrop-blur-2xl"
    >
      <div className="absolute right-10 top-0 h-40 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            AI Operations Center Online
          </div>
          <h2 className="text-3xl font-black tracking-tight md:text-5xl">
            Welcome, {username} <span className="text-cyan-300">👋</span>
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
            Live data from your employees, locations, cameras, and attendance engine.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-slate-400">Today</p>
            <p className="mt-1 font-semibold text-white">{date}</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
            <p className="text-cyan-200/70">Live Time</p>
            <p className="mt-1 font-mono font-semibold text-cyan-100">{time}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MetricCardStack({
  children,
  showDelete,
  deleteLabel,
  onDelete,
}: {
  children: ReactNode;
  showDelete?: boolean;
  deleteLabel: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      {showDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
        >
          <Trash2 size={13} />
          {deleteLabel}
        </button>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon,
  tone,
  delay,
  loading = false,
  onClick,
}: {
  label: string;
  value: number;
  subtitle: string;
  icon: ReactNode;
  tone: "cyan" | "emerald" | "amber" | "violet" | "rose";
  delay: number;
  loading?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    cyan: "from-cyan-400/20 to-blue-500/10 text-cyan-200 shadow-cyan-500/10",
    emerald: "from-emerald-400/20 to-green-500/10 text-emerald-200 shadow-emerald-500/10",
    amber: "from-amber-400/20 to-orange-500/10 text-amber-200 shadow-amber-500/10",
    violet: "from-violet-400/20 to-fuchsia-500/10 text-violet-200 shadow-violet-500/10",
    rose: "from-rose-400/20 to-red-500/10 text-rose-200 shadow-rose-500/10",
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay }}
      whileHover={{ y: -6, scale: 1.02 }}
      className={`group relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${tones[tone]} p-5 text-left shadow-2xl backdrop-blur-2xl ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          {loading ? (
            <p className="mt-3 text-4xl font-black tracking-tight">—</p>
          ) : (
            <AnimatedCounter value={value} />
          )}
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
          {icon}
        </div>
      </div>
    </motion.button>
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    stiffness: 90,
    damping: 20,
  });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    motionValue.set(value);
    const unsubscribe = spring.on("change", (latest) =>
      setDisplay(Math.round(latest))
    );
    return unsubscribe;
  }, [motionValue, spring, value]);

  return (
    <p className="mt-3 text-4xl font-black tracking-tight">
      {display}
    </p>
  );
}

function GlassPanel({
  title,
  action,
  onActionClick,
  children,
}: {
  title: string;
  action?: ReactNode;
  onActionClick?: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="min-w-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-blue-950/20 backdrop-blur-2xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        {action &&
          (onActionClick ? (
            <button
              type="button"
              onClick={onActionClick}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {action}
            </button>
          ) : (
            <div>{action}</div>
          ))}
      </div>
      {children}
    </motion.div>
  );
}

function ChartFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    let animationFrame = 0;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      setIsReady(width > 0 && height > 0);
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measure);
    });

    observer.observe(node);
    animationFrame = requestAnimationFrame(measure);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={frameRef} className="h-[350px] w-full min-w-0 overflow-hidden">
      {isReady ? (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      ) : (
        <div className="h-full w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
      )}
    </div>
  );
}

function LiveCameraFeed({
  cameraId,
  enabled,
  streamConfig,
  locationId,
  onAttendanceMarked,
  onStreamStatusChange,
  onScanPhaseChange,
  onFrameReceived,
  onGateReport,
  onMatchActivity,
  webcamMode = true,
  webcamContext,
}: {
  cameraId?: number | null;
  enabled: boolean;
  streamConfig?: CameraStreamInput | null;
  locationId?: number | null;
  onAttendanceMarked?: (result: LiveMarkResult) => void;
  onStreamStatusChange?: (status: CameraStreamStatus) => void;
  onScanPhaseChange?: (phase: LiveScanPhase) => void;
  onFrameReceived?: (at: Date) => void;
  onGateReport?: (report: GateScanReport) => void;
  onMatchActivity?: () => void;
  webcamMode?: boolean;
  webcamContext?: {
    branch_name?: string;
    entrance?: string;
    entry_exit_type?: string;
    display_name?: string;
  };
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<LiveAttendanceScannerHandle>(null);
  const onFrameReceivedRef = useRef(onFrameReceived);
  onFrameReceivedRef.current = onFrameReceived;

  const handleStreamFrame = useCallback((at: Date) => {
    onFrameReceivedRef.current?.(at);
    scannerRef.current?.onNewFrame();
  }, []);

  if (!enabled) return null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {webcamMode ? (
        <PcWebcamFeed
          enabled={enabled}
          videoRef={videoRef}
          imgRef={imgRef}
          syncToImage={false}
          hdMode
          className="absolute inset-0 h-full w-full object-contain [transform:translateZ(0)]"
          onStreamStatusChange={onStreamStatusChange}
          onFrameReceived={handleStreamFrame}
          frameIntervalMs={16}
        />
      ) : (
        <CctvLiveImage
          cameraId={cameraId!}
          enabled={enabled}
          streamConfig={streamConfig}
          imgRef={imgRef}
          pollIntervalMs={700}
          preview
          className="absolute inset-0 h-full w-full object-contain [transform:translateZ(0)]"
          alt="Live camera feed"
          onStreamStatusChange={onStreamStatusChange}
          onFrameReceived={handleStreamFrame}
        />
      )}
      <LiveAttendanceScanner
        ref={scannerRef}
        cameraId={cameraId ?? null}
        locationId={locationId}
        enabled={enabled}
        imageRef={imgRef}
        videoRef={videoRef}
        liteMode
        webcamMode={webcamMode}
        webcamContext={webcamContext}
        cameraLabel={webcamContext?.display_name || "PC Webcam"}
        scanIntervalMs={1200}
        onMarked={onAttendanceMarked}
        onScanPhaseChange={onScanPhaseChange}
        onReport={onGateReport}
        onMatchActivity={onMatchActivity}
        showBadge={false}
      />
    </div>
  );
}

function StreamStatusBadge({ status }: { status: CameraStreamStatus }) {
  switch (status) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg shadow-emerald-500/30">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </span>
      );
    case "reconnecting":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          RECONNECTING
        </span>
      );
    case "offline":
      return (
        <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-bold text-white">
          OFFLINE
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-600 px-2.5 py-1 text-[10px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
          CONNECTING
        </span>
      );
  }
}

function ScanStatusBadge({ phase }: { phase: LiveScanPhase }) {
  if (phase !== "recognized") return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold text-white">
      <ScanFace size={10} />
      RECOGNIZED
    </span>
  );
}

function AICameraMonitor({
  cameras,
  primaryCamera,
}: {
  cameras: DashboardOverview["cameras"]["items"];
  primaryCamera: DashboardOverview["primary_camera"];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] =
    useState<CameraStreamStatus>("connecting");
  const [scanPhase, setScanPhase] = useState<LiveScanPhase>("idle");
  const [liveEvents, setLiveEvents] = useState<
    Array<{
      id: number;
      event_type: string;
      event_time: string;
      employee_name: string;
      employee_code: string;
      late_minutes: number;
    }>
  >([]);
  const [gateReports, setGateReports] = useState<GateScanReport[]>([]);
  const { config: pcWebcamConfig } = usePcWebcamConfig();

  const webcamContext = useMemo(
    () => ({
      branch_name: pcWebcamConfig.branch_name,
      entrance: pcWebcamConfig.entrance,
      entry_exit_type: pcWebcamConfig.entry_exit_type,
      display_name: pcWebcamConfig.display_name,
    }),
    [pcWebcamConfig]
  );

  const handleGateReport = useCallback((report: GateScanReport) => {
    if (!report.marked) return;
    setGateReports((prev) => [report, ...prev].slice(0, 12));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("dashboard-live-camera-id");
    const storedId = stored ? Number(stored) : NaN;
    if (Number.isInteger(storedId) && cameras.some((item) => item.id === storedId)) {
      setSelectedCameraId(storedId);
      return;
    }
    if (cameras.length === 0) {
      setSelectedCameraId(null);
      return;
    }
    if (primaryCamera?.id) {
      setSelectedCameraId(primaryCamera.id);
    } else if (cameras[0]?.id) {
      setSelectedCameraId(cameras[0].id);
    }
  }, [cameras, primaryCamera?.id]);

  const activeCamera = useMemo(() => {
    const selected = cameras.find((item) => item.id === selectedCameraId);
    if (selected) return selected;
    if (primaryCamera) return primaryCamera;
    return cameras[0] ?? null;
  }, [cameras, primaryCamera, selectedCameraId]);

  const selectCamera = useCallback((cameraId: number) => {
    setSelectedCameraId(cameraId);
    setStreamStatus("connecting");
    setScanPhase("idle");
    setGateReports([]);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboard-live-camera-id", String(cameraId));
    }
    setPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const refreshLiveEvents = useCallback(() => {
    fetch("/api/attendance/live-events?limit=8")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLiveEvents(data.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshLiveEvents();
    const timer = window.setInterval(refreshLiveEvents, 5000);
    return () => window.clearInterval(timer);
  }, [refreshLiveEvents]);

  const attendanceCameraId = activeCamera?.id ?? null;
  const attendanceLocationId =
    activeCamera?.location_id ?? pcWebcamConfig.location_id ?? null;
  const feedEnabled = true;

  const monitorFeed = (
    <div
      className={`relative overflow-hidden bg-slate-950 ${
        fullscreen
          ? "h-full w-full rounded-none border-0"
          : "h-64 rounded-3xl border border-cyan-300/15"
      }`}
    >
      <LiveCameraFeed
        key={attendanceCameraId ?? "pc-webcam"}
        cameraId={attendanceCameraId}
        enabled={feedEnabled}
        locationId={attendanceLocationId ?? undefined}
        streamConfig={
          activeCamera
            ? {
                camera_ip: activeCamera.camera_ip,
                port: activeCamera.port,
                rtsp_url: activeCamera.rtsp_url,
                rtsp_channel: activeCamera.rtsp_channel,
                rtsp_subtype: activeCamera.rtsp_subtype,
                brand: activeCamera.brand,
              }
            : null
        }
        onAttendanceMarked={refreshLiveEvents}
        onStreamStatusChange={setStreamStatus}
        onScanPhaseChange={setScanPhase}
        onGateReport={handleGateReport}
        webcamMode
        webcamContext={webcamContext}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
      <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
        <StreamStatusBadge status={streamStatus} />
        <span className="rounded-full bg-indigo-500/90 px-2.5 py-1 text-[10px] font-bold text-white">
          PC WEBCAM
        </span>
        <ScanStatusBadge phase={scanPhase} />
      </div>
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setFullscreen((value) => !value)}
          className="pointer-events-auto rounded-full border border-white/20 bg-black/50 p-2 text-white transition hover:bg-black/70"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className={`absolute inset-0 z-[1] cursor-zoom-in ${fullscreen ? "hidden" : ""}`}
        aria-label="Open live camera fullscreen"
      />
    </div>
  );

  return (
    <>
      <GlassPanel
        title="Live PC Camera"
        action={cameras.length > 0 ? "Link CCTV" : undefined}
        onActionClick={
          cameras.length > 0 ? () => setPickerOpen((open) => !open) : undefined
        }
      >
        {cameras.length === 0 && (
          <p className="mb-3 text-xs text-slate-400">
            No CCTV cameras — using your PC webcam.{" "}
            <a href="/cameras/pc-webcam" className="text-cyan-400 hover:underline">
              View PC camera details
            </a>
          </p>
        )}
        {pickerOpen && cameras.length > 0 && (
          <div className="mb-4 max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Link attendance to CCTV record ({cameras.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {cameras.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectCamera(item.id)}
                  className={`rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                    item.id === attendanceCameraId
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span className="block">{item.camera_name}</span>
                  <span className="block text-[10px] font-normal opacity-80">
                    {item.location_name || "No location"} · {item.health_status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {fullscreen ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border border-cyan-300/15 bg-slate-950/80 text-sm text-slate-400">
            Live view is fullscreen — press Esc or minimize to return
          </div>
        ) : (
          monitorFeed
        )}

        {liveEvents.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Today — live marks
            </p>
            {liveEvents.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium text-white">{event.employee_name}</p>
                  <p className="text-slate-500">
                    {event.event_type === "CHECK_IN" ? "Check-in" : "Check-out"}
                    {event.late_minutes > 0
                      ? ` · ${formatDurationMinutes(event.late_minutes)} late`
                      : ""}
                  </p>
                </div>
                <span className="text-slate-500">
                  {new Date(event.event_time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {gateReports.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Gate scan report (live)
            </p>
            {gateReports.slice(0, 6).map((report, index) => (
              <div
                key={`${report.at}-${index}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                  report.marked
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : report.employee_name
                      ? "border-cyan-500/20 bg-cyan-500/5"
                      : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <div>
                  <p className="font-medium text-white">
                    {report.employee_name || "Unknown face"}
                  </p>
                  <p className="text-slate-500">{report.message}</p>
                  {report.confidence != null && report.confidence > 0 && (
                    <p className="text-[10px] text-cyan-400">
                      Match {Math.round(report.confidence * 100)}%
                      {report.action ? ` · ${report.action}` : ""}
                      {report.attendance_status
                        ? ` · ${report.attendance_status}`
                        : ""}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-slate-500">
                  {new Date(report.at).toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </GlassPanel>

      {fullscreen && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-black">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">PC Webcam</p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="rounded-xl border border-white/20 bg-white/10 p-2 text-white transition hover:bg-white/20"
              title="Minimize"
              aria-label="Minimize"
            >
              <Minimize2 size={18} />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">{monitorFeed}</div>
        </div>
      )}
    </>
  );
}

function LiveActivityFeed({
  activities,
  onViewAll,
}: {
  activities: DashboardOverview["recent_activity"];
  onViewAll?: () => void;
}) {
  return (
    <GlassPanel title="Recent Activity" action="View All" onActionClick={onViewAll}>
      {activities.length === 0 ? (
        <EmptyState message="No Data Available" />
      ) : (
        <div className="space-y-3">
          {activities.map((item, index) => (
            <motion.div
              key={`${item.title}-${index}`}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06 }}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className={`h-9 w-9 rounded-xl ${activityTone(item.tone)}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="truncate text-xs text-slate-500">{item.source}</p>
              </div>
              <span className="text-xs text-slate-500">{item.time}</span>
            </motion.div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function activityTone(tone: string) {
  const tones: Record<string, string> = {
    blue: "bg-blue-400/15",
    violet: "bg-violet-400/15",
    emerald: "bg-emerald-400/15",
    cyan: "bg-cyan-400/15",
    amber: "bg-amber-400/15",
  };

  return tones[tone] || "bg-slate-400/15";
}

function LocationOverview({
  locations,
  onViewAll,
}: {
  locations: DashboardOverview["locations"];
  onViewAll?: () => void;
}) {
  return (
    <GlassPanel title="Location Wise Overview" action="View All" onActionClick={onViewAll}>
      {locations.length === 0 ? (
        <EmptyState message="No Data Available" />
      ) : (
        <div className="space-y-4">
          {locations.map((item) => (
            <div key={item.location_id}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold">{item.location_name}</p>
                  <p className="text-xs text-slate-500">
                    {item.employee_count} employee{item.employee_count === 1 ? "" : "s"} ·{" "}
                    {item.present_today} present today
                  </p>
                </div>
                <span>{item.attendance_rate}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.attendance_rate}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function CameraStatusPanel({
  cameras,
  onViewAll,
}: {
  cameras: DashboardOverview["cameras"]["items"];
  onViewAll?: () => void;
}) {
  return (
    <GlassPanel title="Camera Status" action="View All" onActionClick={onViewAll}>
      {cameras.length === 0 ? (
        <EmptyState message="No Data Available" />
      ) : (
        <div className="space-y-4">
          {cameras.map((camera) => {
            const online = camera.health_status === "ONLINE";
            return (
              <div key={camera.id} className="flex items-center gap-3 text-sm">
                <Camera size={15} className="text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{camera.camera_name}</span>
                <span className={online ? "text-emerald-300" : "text-rose-300"}>
                  {online ? "Online" : "Offline"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

function SystemHealth({
  onlineCameras,
  totalCameras,
}: {
  onlineCameras: number;
  totalCameras: number;
}) {
  const healthPercent =
    totalCameras > 0
      ? Math.round((onlineCameras / totalCameras) * 100)
      : 100;

  return (
    <GlassPanel title="System Health">
      <div className="grid grid-cols-[120px_1fr] items-center gap-5">
        <div className="relative grid h-32 w-32 place-items-center rounded-full border border-cyan-300/20 bg-cyan-400/5">
          <div className="text-center">
            <p className="text-3xl font-black">{healthPercent}%</p>
            <p className="text-xs text-slate-400">Operational</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          {[
            ["Database", true],
            ["AI Engine", true],
            ["Cameras", totalCameras === 0 || onlineCameras === totalCameras],
            ["Storage", true],
            ["Network", true],
          ].map(([item, ok]) => (
            <div key={String(item)} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={14} className={ok ? "text-emerald-400" : "text-amber-400"} />
                {item}
              </span>
              <span className={`text-xs ${ok ? "text-emerald-300" : "text-amber-300"}`}>
                {ok ? "Operational" : "Needs attention"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}

function CyberBackground() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.28),transparent_24%),radial-gradient(circle_at_76%_12%,rgba(168,85,247,0.24),transparent_22%),radial-gradient(circle_at_60%_88%,rgba(34,211,238,0.16),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.045)_1px,transparent_1px)] bg-[size:72px_72px]" />
    </div>
  );
}

function RadarPulse() {
  return (
    <div className="absolute right-5 top-5 grid h-24 w-24 place-items-center">
      <span className="absolute h-full w-full animate-ping rounded-full border border-cyan-300/20" />
      <div className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/30 bg-cyan-400/10">
        <Radar size={18} className="text-cyan-200" />
      </div>
    </div>
  );
}
