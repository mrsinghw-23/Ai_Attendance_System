"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Camera,
  Play,
  RefreshCw,
  Users,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/providers/ToastProvider";

type DashboardTab = "employee" | "camera" | "location";

export default function AttendanceEnginePanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<DashboardTab>("employee");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/attendance/engine/dashboard?type=${tab}`
    );
    const result = await response.json();
    if (result.success) setData(result.data);
    else showToast(result.message || "Failed to load engine dashboard", "error");
    setLoading(false);
  }, [showToast, tab]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function runEngine() {
    setProcessing(true);
    const response = await fetch("/api/attendance/engine/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 500, finalizeAbsent: true }),
    });
    const result = await response.json();
    if (result.success) {
      showToast(result.message || "Engine processed events", "success");
      loadDashboard();
    } else {
      showToast(result.message || "Engine processing failed", "error");
    }
    setProcessing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={tab === "employee" ? "primary" : "secondary"}
            onClick={() => setTab("employee")}
          >
            <Users size={16} className="mr-2" />
            Employee
          </Button>
          <Button
            variant={tab === "camera" ? "primary" : "secondary"}
            onClick={() => setTab("camera")}
          >
            <Camera size={16} className="mr-2" />
            Camera
          </Button>
          <Button
            variant={tab === "location" ? "primary" : "secondary"}
            onClick={() => setTab("location")}
          >
            <Building2 size={16} className="mr-2" />
            Location
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
          <Button onClick={runEngine} disabled={processing}>
            <Play size={16} className="mr-2" />
            {processing ? "Processing..." : "Run Engine"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-slate-500">
          Loading AI attendance engine...
        </div>
      ) : tab === "employee" ? (
        <EmployeeDashboard data={data} />
      ) : tab === "camera" ? (
        <CameraDashboard data={data} />
      ) : (
        <LocationDashboard data={data} />
      )}
    </div>
  );
}

function EmployeeDashboard({ data }: { data: Record<string, unknown> | null }) {
  const summaries = (data?.summaries as Array<Record<string, unknown>>) || [];
  const movement =
    (data?.movement_logs as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Present" value={Number(data?.present || 0)} />
        <StatCard label="Absent" value={Number(data?.absent || 0)} />
        <StatCard label="Late" value={Number(data?.late || 0)} />
        <StatCard label="Half Day" value={Number(data?.half_day || 0)} />
        <StatCard
          label="Avg Hours"
          value={Number(data?.avg_working_hours || 0)}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md overflow-hidden"
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-semibold">
          Today&apos;s Attendance Summary
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Check In</th>
                <th className="px-4 py-3">Check Out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => (
                <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3">{String(row.employee_name || row.employee_code)}</td>
                  <td className="px-4 py-3">
                    {row.check_in ? new Date(String(row.check_in)).toLocaleTimeString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.check_out ? new Date(String(row.check_out)).toLocaleTimeString() : "—"}
                  </td>
                  <td className="px-4 py-3">{String(row.working_hours || 0)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.attendance_status === "ABSENT" ? "danger" : "success"}>
                      {String(row.attendance_status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4"
      >
        <h3 className="font-semibold mb-3">Movement History</h3>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {movement.map((log) => (
            <div key={String(log.id)} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
              <span className="font-medium">{String(log.employee_code)}</span>{" "}
              {String(log.event_type)} ·{" "}
              {new Date(String(log.event_time)).toLocaleString()}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function CameraDashboard({ data }: { data: Record<string, unknown> | null }) {
  const cameras =
    (data?.camera_wise_attendance as Array<Record<string, unknown>>) || [];
  const activity =
    (data?.recent_activity as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Cameras" value={Number(data?.total_cameras || 0)} />
        <StatCard label="Online" value={Number(data?.online || 0)} />
        <StatCard label="Offline" value={Number(data?.offline || 0)} />
        <StatCard label="Active Employees" value={Number(data?.active_employees || 0)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Camera-wise Attendance">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Camera</th>
                <th className="py-2">Detections</th>
                <th className="py-2">Employees</th>
                <th className="py-2">Health</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((cam) => (
                <tr key={String(cam.camera_id)} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{String(cam.camera_name)}</td>
                  <td className="py-2">{String(cam.detections)}</td>
                  <td className="py-2">{String(cam.unique_employees)}</td>
                  <td className="py-2">{String(cam.health_status || "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Camera Activity">
          <div className="space-y-2">
            {activity.map((item, index) => (
              <div key={index} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
                {String(item.employee_name || "Unknown")} detected on{" "}
                {String(item.camera_name)} at{" "}
                {new Date(String(item.event_time)).toLocaleTimeString()}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LocationDashboard({ data }: { data: Record<string, unknown> | null }) {
  const locations =
    (data?.locations as Array<Record<string, unknown>>) || [];

  return (
    <Panel title="Multi-Location Monitoring">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-2">Location</th>
            <th className="py-2">Employees</th>
            <th className="py-2">Cameras</th>
            <th className="py-2">Present</th>
            <th className="py-2">Absent</th>
            <th className="py-2">Late</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={String(loc.location_id)} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2">{String(loc.location_name)}</td>
              <td className="py-2">{String(loc.employee_count)}</td>
              <td className="py-2">{String(loc.camera_count)}</td>
              <td className="py-2">{String(loc.present_today)}</td>
              <td className="py-2">{String(loc.absent_today)}</td>
              <td className="py-2">{String(loc.late_today)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4"
    >
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}
