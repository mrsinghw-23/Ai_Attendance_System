"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileBarChart, FileSpreadsheet, RefreshCw, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canDeleteRecords } from "@/utils/permissions";
import { getTodayInTimezone } from "@/utils/timezone";
import { formatReportColumnLabel } from "@/utils/duration-format";
import { ReportResult, ReportType } from "@/types/phase6";

const reportOptions: Array<{ label: string; value: ReportType }> = [
  { label: "Attendance Reports", value: "attendance" },
  { label: "Daily Attendance", value: "daily_attendance" },
  { label: "Employee Attendance", value: "employee_attendance" },
  { label: "Late Arrival", value: "late_arrival" },
  { label: "Half Day", value: "half_day" },
  { label: "Absent", value: "absent" },
  { label: "Working Hours", value: "working_hours" },
  { label: "Movement", value: "movement" },
  { label: "Camera Activity", value: "camera_activity" },
  { label: "Camera Attendance (AI)", value: "camera_attendance" },
  { label: "AI Face Recognition", value: "ai_face_recognition" },
  { label: "AI Gate Attendance (Auto)", value: "ai_gate_attendance" },
  { label: "Location Attendance", value: "location_attendance" },
  { label: "Employee Reports", value: "employees" },
  { label: "Location Reports", value: "locations" },
  { label: "Camera Reports", value: "cameras" },
  { label: "Camera Health Report", value: "camera_health" },
  { label: "Camera Uptime Report", value: "camera_uptime" },
  { label: "Camera Downtime Report", value: "camera_downtime" },
  { label: "Motion Detection Report", value: "motion_detection" },
  { label: "Location-wise Camera Report", value: "location_camera" },
  { label: "Face Registration Report", value: "face_registration" },
  { label: "Missing Face Profiles", value: "missing_face_profiles" },
  { label: "Registration Progress", value: "registration_progress" },
  { label: "Audit Reports", value: "audit" },
];

const HIDDEN_COLUMNS = new Set(["record_id", "id"]);

function todayIso() {
  return getTodayInTimezone();
}

type DeleteTarget = {
  url: string;
  label: string;
};

function getRowDeleteTarget(
  reportType: ReportType,
  row: Record<string, unknown>,
  role: string
): DeleteTarget | null {
  if (!canDeleteRecords(role)) return null;

  if (reportType === "attendance") {
    const id = Number(row.record_id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      url: `/api/attendance/records/${id}`,
      label: `${row.employee || "Employee"} · ${row.attendance_date || "date"}`,
    };
  }

  if (reportType === "unknown_faces") {
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      url: `/api/ai/unknown-faces/${id}`,
      label: `Unknown face · ${row.detected_at || "record"}`,
    };
  }

  return null;
}

type DailyArchive = {
  report_date: string;
  generated_at: string;
  output_dir: string;
  files: Array<{
    type: string;
    format: string;
    file: string;
    rows: number;
  }>;
};

export default function ReportsPage() {
  const { showToast } = useToast();
  const { user } = useCurrentUser();
  const [type, setType] = useState<ReportType>("attendance");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archives, setArchives] = useState<DailyArchive[]>([]);
  const [archivesLoading, setArchivesLoading] = useState(true);
  const [generatingDaily, setGeneratingDaily] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ type });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (fromTime) params.set("fromTime", fromTime);
    if (toTime) params.set("toTime", toTime);
    return params.toString();
  }, [type, from, to, fromTime, toTime]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/reports?${queryString}`);
    const data = await response.json();

    if (data.success) {
      setReport(data.data);
    } else {
      showToast(data.message || "Failed to load report", "error");
      setReport(null);
    }
    setLoading(false);
  }, [queryString, showToast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const loadArchives = useCallback(async () => {
    setArchivesLoading(true);
    try {
      const response = await fetch("/api/reports/daily-archive?limit=14");
      const data = await response.json();
      if (data.success) {
        setArchives(data.data?.archives || []);
      }
    } catch {
      setArchives([]);
    } finally {
      setArchivesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArchives();
  }, [loadArchives]);

  async function generateDailyArchive() {
    setGeneratingDaily(true);
    try {
      const response = await fetch("/api/reports/generate-daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (data.success) {
        showToast(data.message || "Daily reports generated", "success");
        await loadArchives();
      } else {
        showToast(data.message || "Failed to generate daily reports", "error");
      }
    } catch {
      showToast("Failed to generate daily reports", "error");
    } finally {
      setGeneratingDaily(false);
    }
  }

  function downloadArchive(date: string, reportType: string, format: string) {
    window.open(
      `/api/reports/daily-archive?date=${encodeURIComponent(date)}&type=${encodeURIComponent(reportType)}&format=${encodeURIComponent(format)}`,
      "_blank"
    );
  }

  const visibleColumns = useMemo(
    () => report?.columns.filter((column) => !HIDDEN_COLUMNS.has(column)) ?? [],
    [report]
  );

  const canDeleteRows = useMemo(
    () =>
      canDeleteRecords(user?.role || "") &&
      (type === "attendance" || type === "unknown_faces"),
    [user?.role, type]
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const response = await fetch(deleteTarget.url, { method: "DELETE" });
    const data = await response.json();

    if (data.success) {
      showToast("Record deleted", "success");
      setDeleteTarget(null);
      await loadReport();
    } else {
      showToast(data.message || "Delete failed", "error");
    }

    setDeleting(false);
  }

  function exportReport(format: "csv" | "excel" | "pdf") {
    window.open(`/api/reports/export?${queryString}&format=${format}`, "_blank");
  }

  return (
    <DashboardLayout title="Reports" module="reports">
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Select
              label="Report Type"
              value={type}
              onChange={(event) => setType(event.target.value as ReportType)}
              options={reportOptions}
            />
            <Input
              label="From Date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="To Date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Input
              label="From Time (optional)"
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
            />
            <Input
              label="To Time (optional)"
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={loadReport} disabled={loading}>
              <RefreshCw size={16} className="mr-2" />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => exportReport("csv")}>
              <Download size={16} className="mr-2" />
              CSV
            </Button>
            <Button variant="secondary" onClick={() => exportReport("excel")}>
              <FileSpreadsheet size={16} className="mr-2" />
              Excel
            </Button>
            <Button onClick={() => exportReport("pdf")}>
              <FileBarChart size={16} className="mr-2" />
              PDF
            </Button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Reports show real data from cameras and attendance engine. Attendance
            and unknown-face rows can be deleted by Super Admin only from the table.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Daily Auto-Generated Reports
              </h3>
              <p className="text-sm text-slate-500">
                Archived CSV, Excel, and PDF exports saved each night.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void generateDailyArchive()}
              disabled={generatingDaily}
            >
              <RefreshCw size={16} className="mr-2" />
              {generatingDaily ? "Generating…" : "Generate Now"}
            </Button>
          </div>

          {archivesLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading archives…</p>
          ) : archives.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No archived reports yet. Run the nightly scheduler or click Generate Now.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {archives.map((archive) => (
                <div
                  key={archive.report_date}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {archive.report_date}
                      </p>
                      <p className="text-xs text-slate-500">
                        Generated {new Date(archive.generated_at).toLocaleString()} ·{" "}
                        {archive.files.length} files
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["daily_attendance", "working_hours", "movement", "ai_face_recognition"].map(
                      (reportType) => (
                        <div key={reportType} className="flex gap-1">
                          {(["csv", "excel", "pdf"] as const).map((format) => (
                            <button
                              key={`${reportType}-${format}`}
                              type="button"
                              onClick={() =>
                                downloadArchive(archive.report_date, reportType, format)
                              }
                              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              {reportType.replace(/_/g, " ")} · {format.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md overflow-hidden"
        >
          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {report?.title || "Report Preview"}
            </h3>
            <p className="text-sm text-slate-500">
              {report?.rows.length || 0} rows
              {from || to ? ` · ${from || "…"} to ${to || "…"}` : ""}
            </p>
          </div>
          {loading ? (
            <div className="p-6 text-slate-500">Loading report...</div>
          ) : !report ? (
            <div className="p-6 text-slate-500">No report data.</div>
          ) : report.rows.length === 0 ? (
            <div className="p-6 text-slate-500">
              No records for this date range. Add cameras, register faces, and run
              the AI recognition service to generate data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column} className="px-4 py-3 font-medium whitespace-nowrap">
                        {formatReportColumnLabel(column)}
                      </th>
                    ))}
                    {canDeleteRows && (
                      <th className="px-4 py-3 font-medium whitespace-nowrap">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, 500).map((row, index) => {
                    const deleteConfig = getRowDeleteTarget(
                      type,
                      row,
                      user?.role || ""
                    );

                    return (
                      <tr
                        key={index}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        {visibleColumns.map((column) => (
                          <td
                            key={column}
                            className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                          >
                            {String(row[column] ?? "")}
                          </td>
                        ))}
                        {canDeleteRows && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {deleteConfig ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(deleteConfig)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Record"
        message={`Delete ${deleteTarget?.label}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
