"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  Clock,
  LogIn,
  LogOut,
  Search,
  Timer,
  Trash2,
  TrendingUp,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Button from "@/components/ui/Button";
import Badge, {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/components/ui/Badge";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/providers/ToastProvider";
import { canDeleteRecords } from "@/utils/permissions";
import { UserRole } from "@/types/roles";
import {
  AttendanceDashboardStats,
  AttendanceLog,
  AttendanceRecord,
  DailyAttendanceTrend,
  MonthlyAttendanceTrend,
} from "@/types/attendance";
import { Employee } from "@/types/employee";
import { Location } from "@/types/location";
import AttendanceEnginePanel from "@/components/attendance/AttendanceEnginePanel";
import { ConfirmModal } from "@/components/ui/Modal";
import { formatDateTimeIST, formatTimeIST } from "@/utils/timezone";

const EMPTY_STATS: AttendanceDashboardStats = {
  total_records: 0,
  present: 0,
  late: 0,
  early_exit: 0,
  overtime: 0,
  avg_working_hours: 0,
};

export default function AttendancePage() {
  const { user } = useCurrentUser();
  const { showToast } = useToast();

  const [records, setRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [logs, setLogs] = useState<AttendanceLog[]>(
    []
  );
  const [stats, setStats] =
    useState<AttendanceDashboardStats>(EMPTY_STATS);
  const [daily, setDaily] = useState<
    DailyAttendanceTrend[]
  >([]);
  const [monthly, setMonthly] = useState<
    MonthlyAttendanceTrend[]
  >([]);
  const [employees, setEmployees] = useState<
    Employee[]
  >([]);
  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] =
    useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locationId, setLocationId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState("");
  const [view, setView] = useState<"records" | "engine">("records");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "record" | "log";
    id: number;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isEmployee =
    user?.role === UserRole.EMPLOYEE;

  const canDelete = canDeleteRecords(user?.role || "");

  const hasDailyData = daily.some(
    (row) => row.present > 0 || row.late > 0 || row.overtime > 0
  );
  const hasMonthlyData = monthly.some(
    (row) => row.present > 0 || row.late > 0 || row.overtime > 0
  );

  const effectiveEmployeeId = useMemo(() => {
    if (isEmployee) {
      return user?.employee_id
        ? String(user.employee_id)
        : "";
    }
    return selectedEmployeeId;
  }, [isEmployee, selectedEmployeeId, user]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const url =
      deleteTarget.kind === "record"
        ? `/api/attendance/records/${deleteTarget.id}`
        : `/api/attendance/logs/${deleteTarget.id}`;

    const response = await fetch(url, { method: "DELETE" });
    const data = await response.json();

    if (data.success) {
      showToast(
        deleteTarget.kind === "record"
          ? "Attendance record deleted"
          : "Attendance log deleted",
        "success"
      );
      setDeleteTarget(null);
      fetchData();
    } else if (response.status === 404) {
      showToast(
        "This record no longer exists. Refreshing the list.",
        "info"
      );
      setDeleteTarget(null);
      setRecords([]);
      setLogs([]);
      fetchData();
    } else {
      showToast(data.message || "Failed to delete", "error");
    }

    setDeleting(false);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (locationId) {
      params.set("location_id", locationId);
    }

    const cacheOpts = { cache: "no-store" as RequestCache };
    const [recordsRes, dashboardRes, logsRes] =
      await Promise.all([
        fetch(`/api/attendance?${params}`, cacheOpts),
        fetch("/api/attendance/dashboard", cacheOpts),
        fetch("/api/attendance/logs", cacheOpts),
      ]);

    const recordsData = await recordsRes.json();
    const dashboardData = await dashboardRes.json();
    const logsData = await logsRes.json();

    if (recordsData.success) {
      setRecords(recordsData.data);
    } else {
      showToast(
        recordsData.message ||
          "Failed to load attendance",
        "error"
      );
    }

    if (dashboardData.success) {
      setStats(dashboardData.data.stats);
      setDaily(dashboardData.data.daily);
      setMonthly(dashboardData.data.monthly);
    }

    if (logsData.success) {
      setLogs(logsData.data);
    }

    setLoading(false);
  }, [search, status, from, to, locationId, showToast]);

  useEffect(() => {
    const timeout = setTimeout(fetchData, 300);
    return () => clearTimeout(timeout);
  }, [fetchData]);

  useEffect(() => {
    function onFocus() {
      fetchData();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  useEffect(() => {
    async function loadReferenceData() {
      if (!user || isEmployee) return;

      const [employeesRes, locationsRes] =
        await Promise.all([
          fetch("/api/employees?limit=100"),
          fetch("/api/locations"),
        ]);
      const employeesData = await employeesRes.json();
      const locationsData = await locationsRes.json();

      if (employeesData.success) {
        setEmployees(employeesData.data);
      }
      if (locationsData.success) {
        setLocations(locationsData.data);
      }
    }

    loadReferenceData();
  }, [user, isEmployee]);

  async function handleAttendanceAction(
    action: "check-in" | "check-out"
  ) {
    if (!effectiveEmployeeId) {
      showToast("Select an employee first", "error");
      return;
    }

    setActionLoading(true);
    const response = await fetch(
      `/api/attendance/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employee_id: Number(effectiveEmployeeId),
          source: "MANUAL",
        }),
      }
    );
    const data = await response.json();

    if (data.success) {
      showToast(
        action === "check-in"
          ? "Check-in recorded"
          : "Check-out recorded",
        "success"
      );
      fetchData();
    } else {
      showToast(
        data.message || "Attendance action failed",
        "error"
      );
    }

    setActionLoading(false);
  }

  return (
    <DashboardLayout
      title="Attendance Management"
      module="attendance"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === "records" ? "primary" : "secondary"}
            onClick={() => setView("records")}
          >
            Attendance Records
          </Button>
          {!isEmployee && (
            <Button
              variant={view === "engine" ? "primary" : "secondary"}
              onClick={() => setView("engine")}
            >
              AI Processing Engine
            </Button>
          )}
        </div>

        {view === "engine" ? (
          <AttendanceEnginePanel />
        ) : (
        <>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard
            icon={<CalendarDays size={18} />}
            label="Records"
            value={stats.total_records}
            tone="blue"
          />
          <StatCard
            icon={<Clock size={18} />}
            label="Present"
            value={stats.present}
            tone="emerald"
          />
          <StatCard
            icon={<Timer size={18} />}
            label="Late"
            value={stats.late}
            tone="amber"
          />
          <StatCard
            icon={<LogOut size={18} />}
            label="Early Exit"
            value={stats.early_exit}
            tone="rose"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Avg Hours"
            value={stats.avg_working_hours}
            tone="violet"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartPanel title="Daily Attendance">
              {hasDailyData ? (
                <AreaChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="attendance_date"
                    tickFormatter={(value) => formatChartDate(String(value))}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(value) => formatChartDate(String(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="present"
                    stroke="#2563eb"
                    fill="#93c5fd"
                  />
                  <Area
                    type="monotone"
                    dataKey="late"
                    stroke="#f59e0b"
                    fill="#fde68a"
                  />
                </AreaChart>
              ) : (
                <EmptyChart message="No Data Available" />
              )}
            </ChartPanel>

            <ChartPanel title="Monthly Attendance">
              {hasMonthlyData ? (
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(value) => formatChartMonth(String(value))}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(value) => formatChartMonth(String(value))}
                  />
                  <Bar dataKey="present" fill="#10b981" />
                  <Bar dataKey="late" fill="#f59e0b" />
                  <Bar dataKey="overtime" fill="#8b5cf6" />
                </BarChart>
              ) : (
                <EmptyChart message="No Data Available" />
              )}
            </ChartPanel>
          </div>
        </motion.div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <Input
              label="Search"
              placeholder="Employee name or code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { label: "All", value: "" },
                { label: "Present", value: "PRESENT" },
                { label: "Late", value: "LATE" },
                { label: "Early Exit", value: "EARLY_EXIT" },
                { label: "Overtime", value: "OVERTIME" },
              ]}
            />
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {!isEmployee && (
              <Select
                label="Location"
                value={locationId}
                onChange={(e) =>
                  setLocationId(e.target.value)
                }
                options={[
                  { label: "All Locations", value: "" },
                  ...locations.map((location) => ({
                    label: location.location_name,
                    value: location.id,
                  })),
                ]}
              />
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-end gap-3">
            {!isEmployee && (
              <Select
                label="Employee for Manual Action"
                value={selectedEmployeeId}
                onChange={(e) =>
                  setSelectedEmployeeId(e.target.value)
                }
                options={[
                  { label: "Select Employee", value: "" },
                  ...employees.map((employee) => ({
                    label: `${employee.first_name} ${employee.last_name} (${employee.employee_code})`,
                    value: employee.id,
                  })),
                ]}
              />
            )}
            <Button
              onClick={() =>
                handleAttendanceAction("check-in")
              }
              disabled={actionLoading}
            >
              <LogIn size={16} className="mr-2" />
              Check In
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                handleAttendanceAction("check-out")
              }
              disabled={actionLoading}
            >
              <LogOut size={16} className="mr-2" />
              Check Out
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Search size={16} />
              <h3 className="font-semibold">
                Attendance Reports
              </h3>
            </div>
            {loading ? (
              <div className="p-6 text-slate-500">
                Loading attendance...
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No Data Available
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">In</th>
                      <th className="px-4 py-3">Out</th>
                      <th className="px-4 py-3">Hours</th>
                      <th className="px-4 py-3">Status</th>
                      {canDelete && (
                        <th className="px-4 py-3 text-right">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {record.employee_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {record.employee_code}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {formatDisplayDate(record.attendance_date)}
                        </td>
                        <td className="px-4 py-3">
                          {formatTime(record.check_in)}
                        </td>
                        <td className="px-4 py-3">
                          {formatTime(record.check_out)}
                        </td>
                        <td className="px-4 py-3">
                          {record.working_hours}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getStatusBadgeVariant(
                              record.status
                            )}
                          >
                            {formatStatusLabel(record.status)}
                          </Badge>
                        </td>
                        {canDelete && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "record",
                                  id: record.id,
                                  label: `${record.employee_name} · ${record.attendance_date}`,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="Delete attendance record"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
            <h3 className="font-semibold mb-4">
              Employee Timeline
            </h3>
            <div className="space-y-3">
              {logs.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No Data Available
                </p>
              ) : (
                logs.slice(0, 12).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">
                        {log.employee_name}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            log.event_type === "CHECK_IN"
                              ? "success"
                              : "info"
                          }
                        >
                          {log.event_type === "CHECK_IN"
                            ? "In"
                            : "Out"}
                        </Badge>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "log",
                                id: log.id,
                                label: `${log.employee_name} · ${log.event_type}`,
                              })
                            }
                            className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            title="Delete log"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatDateTimeIST(log.event_time, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}{" "}
                      · {log.source}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title={
          deleteTarget?.kind === "record"
            ? "Delete Attendance Record"
            : "Delete Attendance Log"
        }
        message={
          deleteTarget?.kind === "record"
            ? `Delete attendance for ${deleteTarget.label}? Related logs and summary for that day will also be removed.`
            : `Delete this check-in/out log (${deleteTarget?.label})?`
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return formatTimeIST(value);
}

function formatDisplayDate(value: string) {
  if (!value) return "-";
  return formatDateTimeIST(`${value}T12:00:00`, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatChartDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatDateTimeIST(`${value}T12:00:00`, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatChartMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split("-");
  const label = formatDateTimeIST(`${year}-${month}-01T12:00:00`, {
    month: "short",
    year: "numeric",
  });
  return label;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[350px] items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">
      {message}
    </div>
  );
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
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
    <div className="min-w-0 overflow-hidden">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div ref={frameRef} className="h-[350px] w-full min-w-0 overflow-hidden">
        {isReady ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/70" />
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "blue" | "emerald" | "amber" | "rose" | "violet";
}) {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300",
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300",
    amber:
      "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300",
    violet:
      "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
    >
      <div
        className={`inline-flex rounded-lg p-2 ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="text-sm text-slate-500">{label}</p>
    </motion.div>
  );
}