"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  Radio,
  Wrench,
  Wifi,
  WifiOff,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  CameraEvent,
  CameraHealthLog,
  CameraOperationsDashboard,
  CameraStats,
} from "@/types/camera";

const EMPTY: CameraOperationsDashboard = {
  stats: {
    total: 0,
    active: 0,
    inactive: 0,
    online: 0,
    offline: 0,
    warning: 0,
    maintenance: 0,
    errors: 0,
    recording: 0,
  },
  recent_events: [],
  health_timeline: [],
  motion_events: [],
  camera_attendance: [],
};

export default function CameraOperationsPanel() {
  const [data, setData] = useState<CameraOperationsDashboard>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  async function loadDashboard() {
    const res = await fetch("/api/cameras/operations/dashboard");
    const body = await res.json();
    if (body.success) setData(body.data);
    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 60000);
    return () => clearInterval(timer);
  }, []);

  async function runHealthCheck() {
    setChecking(true);
    await fetch("/api/cameras/health", { method: "POST" });
    await loadDashboard();
    setChecking(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500">
        Loading camera operations...
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Live Camera Operations
          </h3>
          <p className="text-sm text-slate-500">
            Real-time status refreshes every minute
          </p>
        </div>
        <Button variant="secondary" onClick={runHealthCheck} disabled={checking}>
          {checking ? "Checking..." : "Run Health Check"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total" value={stats.total} icon={<Camera size={18} />} />
        <StatCard label="Online" value={stats.online} icon={<Wifi size={18} />} tone="success" />
        <StatCard label="Offline" value={stats.offline} icon={<WifiOff size={18} />} tone="danger" />
        <StatCard label="Errors" value={stats.errors} icon={<AlertTriangle size={18} />} tone="warning" />
        <StatCard label="Warning" value={stats.warning} icon={<Activity size={18} />} tone="warning" />
        <StatCard label="Maintenance" value={stats.maintenance} icon={<Wrench size={18} />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Recent Camera Events">
          {data.recent_events.length === 0 ? (
            <Empty message="No camera events yet." />
          ) : (
            <EventList events={data.recent_events} />
          )}
        </Panel>

        <Panel title="Motion Events">
          {data.motion_events.length === 0 ? (
            <Empty message="No motion events recorded yet." />
          ) : (
            <EventList events={data.motion_events} />
          )}
        </Panel>

        <Panel title="Camera Health Timeline">
          {data.health_timeline.length === 0 ? (
            <Empty message="Run a health check to populate timeline." />
          ) : (
            <HealthTimeline logs={data.health_timeline} />
          )}
        </Panel>

        <Panel title="Camera-wise Attendance">
          {data.camera_attendance.length === 0 ? (
            <Empty message="No face detections linked to cameras yet." />
          ) : (
            <div className="space-y-3">
              {data.camera_attendance.map((row) => (
                <div
                  key={row.camera_id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {row.camera_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.location_name || "Unassigned"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{row.detections_today} today</p>
                    <p>{row.unique_employees} employees</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "success" | "danger" | "warning";
}) {
  const tones = {
    success: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    danger: "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20",
    warning: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20",
    default: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60",
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone || "default"]}`}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-5">
      <h4 className="mb-4 font-semibold text-slate-900 dark:text-white">{title}</h4>
      {children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function EventList({ events }: { events: CameraEvent[] }) {
  return (
    <div className="space-y-3 max-h-72 overflow-y-auto">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-cyan-500" />
              <span className="font-medium text-slate-900 dark:text-white">
                {event.camera_name || `Camera #${event.camera_id}`}
              </span>
            </div>
            <Badge variant="neutral">{formatEventType(event.event_type)}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {event.message || "—"} · {new Date(event.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function HealthTimeline({ logs }: { logs: CameraHealthLog[] }) {
  return (
    <div className="space-y-3 max-h-72 overflow-y-auto">
      {logs.map((log) => (
        <div
          key={log.id}
          className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{log.camera_name}</span>
            <Badge
              variant={
                log.health_status === "ONLINE"
                  ? "success"
                  : log.health_status === "WARNING"
                    ? "warning"
                    : "danger"
              }
            >
              {log.health_status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Reachable: {log.camera_reachable ? "Yes" : "No"} · RTSP:{" "}
            {log.rtsp_reachable ? "Yes" : "No"} · Stream:{" "}
            {log.stream_available ? "Yes" : "No"}
            {log.latency_ms != null ? ` · ${log.latency_ms}ms` : ""}
          </p>
          <p className="text-xs text-slate-400">
            {new Date(log.checked_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatEventType(type: string) {
  return type.replace(/_/g, " ");
}
