"use client";

import { useState } from "react";
import Link from "next/link";
import { Eraser, ExternalLink, Plus, Trash2 } from "lucide-react";
import Modal, { ConfirmModal } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { DashboardDetailResult, DashboardDetailType } from "@/types/dashboard";
import {
  canDeleteRecords,
  canManageAttendance,
  canManageCameras,
} from "@/utils/permissions";
import { formatDurationMinutes } from "@/utils/duration-format";
import { useToast } from "@/providers/ToastProvider";

const COLUMN_LABELS: Record<string, string> = {
  employee_code: "Code",
  employee_name: "Name",
  department: "Department",
  location_name: "Location",
  attendance_status: "Attendance",
  employee_status: "Status",
  check_in: "Check In",
  check_out: "Check Out",
  late_minutes: "Late",
  working_hours: "Hours",
  camera_name: "Camera",
  health_status: "Health",
  status: "Status",
  camera_ip: "IP Address",
  last_seen: "Last Seen",
  username: "Username",
  full_name: "Full Name",
  email: "Email",
  role: "Role",
  last_login_at: "Last Login",
  event_time: "Time",
  event_type: "Event",
  confidence: "Confidence",
  image_path: "Image",
  detected_at: "Detected At",
  source: "Source",
  profile_status: "Face Status",
  image_count: "Images",
  employee_count: "Employees",
  present_today: "Present Today",
  camera_count: "Cameras",
  scan_status: "Scan",
};

const HIDDEN_COLUMNS = new Set([
  "id",
  "log_id",
  "record_id",
  "employee_id",
  "location_id",
]);

const ATTENDANCE_LIST_TYPES = new Set([
  "present",
  "late",
  "absent",
  "half_day",
  "total_employees",
]);

type BulkAction =
  | { kind: "face_dedupe" }
  | { kind: "face_delete_all" }
  | { kind: "unknown_delete_all" }
  | { kind: "logs_delete_all"; aiOnly: boolean };

interface DashboardDetailModalProps {
  open: boolean;
  loading: boolean;
  detail: DashboardDetailResult | null;
  onClose: () => void;
  onRefresh?: () => void;
  onStatsRefresh?: () => void;
  userRole?: string;
  userPermissions?: string[];
}

function getAddLink(type: DashboardDetailType): { href: string; label: string } | null {
  if (ATTENDANCE_LIST_TYPES.has(type)) {
    return { href: "/employees", label: "Add employee" };
  }
  if (type === "cameras") return { href: "/cameras", label: "Add camera" };
  if (type.startsWith("users_")) return { href: "/users", label: "Add user" };
  if (type.startsWith("face_")) return { href: "/employees", label: "Register face" };
  if (type === "faces_detected" || type === "faces_recognized") {
    return { href: "/cameras/pc-webcam", label: "PC webcam settings" };
  }
  if (type === "attendance_generated" || type === "recent_activity") {
    return { href: "/attendance", label: "Open attendance" };
  }
  if (type === "unknown_faces") return { href: "/cameras", label: "View cameras" };
  return null;
}

function getDeleteConfig(
  type: DashboardDetailType,
  row: Record<string, unknown>,
  role: string,
  permissions?: string[]
): { url: string; label: string } | null {
  const canManage = canManageAttendance(role, permissions);

  if (
    (type === "faces_detected" || type === "faces_recognized") &&
    row.id &&
    canManage
  ) {
    return {
      url: `/api/ai/face-events/${row.id}`,
      label: `${row.employee_name || "Scan"} · ${row.event_time || "record"}`,
    };
  }

  if (type === "unknown_faces" && row.id && canManage) {
    return {
      url: `/api/ai/unknown-faces/${row.id}`,
      label: `Unknown face · ${row.detected_at || "record"}`,
    };
  }

  if (
    (type === "attendance_generated" || type === "recent_activity") &&
    row.log_id &&
    canManage
  ) {
    return {
      url: `/api/attendance/logs/${row.log_id}`,
      label: `${row.employee_name || "Employee"} · ${row.event_type || "log"}`,
    };
  }

  if (
    ["present", "late", "absent", "half_day"].includes(type) &&
    row.record_id &&
    canManage
  ) {
    return {
      url: `/api/attendance/records/${row.record_id}`,
      label: `${row.employee_name || "Employee"} · today's attendance`,
    };
  }

  if (type === "cameras" && row.id && canManageCameras(role, permissions)) {
    return {
      url: `/api/cameras/${row.id}`,
      label: `${row.camera_name || "Camera"}`,
    };
  }

  if (type.startsWith("users_") && row.id && canDeleteRecords(role)) {
    return {
      url: `/api/users/${row.id}`,
      label: `${row.username || "User"}`,
    };
  }

  return null;
}

function canManageDetailType(
  type: DashboardDetailType,
  role: string,
  permissions?: string[]
) {
  if (type === "faces_detected" || type === "faces_recognized") {
    return canManageAttendance(role, permissions);
  }
  if (
    type === "unknown_faces" ||
    type === "attendance_generated" ||
    type === "recent_activity" ||
    ["present", "late", "absent", "half_day"].includes(type)
  ) {
    return canManageAttendance(role, permissions);
  }
  if (type === "cameras") return canManageCameras(role, permissions);
  if (type.startsWith("users_")) return canDeleteRecords(role);
  return false;
}

function isFaceScanDetail(type: DashboardDetailType | undefined) {
  return type === "faces_detected" || type === "faces_recognized";
}

export default function DashboardDetailModal({
  open,
  loading,
  detail,
  onClose,
  onRefresh,
  onStatsRefresh,
  userRole = "",
  userPermissions,
}: DashboardDetailModalProps) {
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visibleColumns =
    detail?.columns.filter((column) => !HIDDEN_COLUMNS.has(column)) ?? [];

  const canManage = detail
    ? canManageDetailType(detail.type, userRole, userPermissions)
    : false;

  const addLink = detail ? getAddLink(detail.type) : null;
  const duplicateCount = Number(detail?.meta?.duplicate_count || 0);
  const faceScope =
    detail?.type === "faces_recognized" ? "recognized" : "detected";

  const showActionsColumn = canManage && (detail?.rows.length ?? 0) > 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const response = await fetch(deleteTarget.url, { method: "DELETE" });
    const data = await response.json();

    if (data.success) {
      showToast("Record deleted", "success");
      setDeleteTarget(null);
      onRefresh?.();
      onStatsRefresh?.();
    } else {
      showToast(data.message || "Delete failed", "error");
    }

    setDeleting(false);
  }

  async function confirmBulkAction() {
    if (!bulkAction || !detail) return;
    setDeleting(true);

    let response: Response;
    if (bulkAction.kind === "face_dedupe" || bulkAction.kind === "face_delete_all") {
      response = await fetch("/api/ai/face-events/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkAction.kind === "face_dedupe" ? "dedupe" : "delete_all",
          scope: faceScope,
        }),
      });
    } else if (bulkAction.kind === "unknown_delete_all") {
      response = await fetch("/api/ai/unknown-faces/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_all" }),
      });
    } else {
      response = await fetch("/api/attendance/logs/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_all",
          aiOnly: bulkAction.aiOnly,
        }),
      });
    }

    const data = await response.json();

    if (data.success) {
      showToast(data.message || "Updated records", "success");
      setBulkAction(null);
      onRefresh?.();
      onStatsRefresh?.();
    } else {
      showToast(data.message || "Action failed", "error");
    }

    setDeleting(false);
  }

  function renderToolbar() {
    if (!detail || !canManage) return null;

    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        {isFaceScanDetail(detail.type) && (
          <p className="mr-auto text-xs text-slate-500">
            {duplicateCount > 0
              ? `${duplicateCount} duplicate scan(s). Keep first scan per employee.`
              : "Manage today's face scans below."}
          </p>
        )}
        {!isFaceScanDetail(detail.type) && (
          <p className="mr-auto text-xs text-slate-500">
            Delete rows or use bulk actions to clean today's data.
          </p>
        )}

        {addLink && (
          <Link href={addLink.href}>
            <Button type="button" size="sm" variant="secondary">
              <Plus size={14} className="mr-1" />
              {addLink.label}
            </Button>
          </Link>
        )}

        {isFaceScanDetail(detail.type) && duplicateCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={deleting}
            onClick={() => setBulkAction({ kind: "face_dedupe" })}
          >
            <Eraser size={14} className="mr-1" />
            Remove duplicates
          </Button>
        )}

        {isFaceScanDetail(detail.type) && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() => setBulkAction({ kind: "face_delete_all" })}
          >
            <Trash2 size={14} className="mr-1" />
            Delete all scans
          </Button>
        )}

        {detail.type === "unknown_faces" && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() => setBulkAction({ kind: "unknown_delete_all" })}
          >
            <Trash2 size={14} className="mr-1" />
            Delete all today
          </Button>
        )}

        {(detail.type === "attendance_generated" ||
          detail.type === "recent_activity") && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() =>
              setBulkAction({
                kind: "logs_delete_all",
                aiOnly: detail.type === "attendance_generated",
              })
            }
          >
            <Trash2 size={14} className="mr-1" />
            Delete all today
          </Button>
        )}
      </div>
    );
  }

  function bulkConfirmMessage() {
    if (!bulkAction) return "";
    switch (bulkAction.kind) {
      case "face_dedupe":
        return "Keep only the first scan per employee for today and delete duplicate scan records? Check-in times will not change.";
      case "face_delete_all":
        return "Delete all face scan records for today in this list? Attendance already created will remain.";
      case "unknown_delete_all":
        return "Delete all unknown face snapshots saved today?";
      case "logs_delete_all":
        return bulkAction.aiOnly
          ? "Delete all AI attendance logs for today?"
          : "Delete all attendance activity logs for today?";
      default:
        return "";
    }
  }

  function bulkConfirmTitle() {
    if (!bulkAction) return "";
    switch (bulkAction.kind) {
      case "face_dedupe":
        return "Remove Duplicate Scans";
      case "face_delete_all":
        return "Delete All Scans Today";
      case "unknown_delete_all":
        return "Delete All Unknown Faces";
      case "logs_delete_all":
        return "Delete All Logs Today";
      default:
        return "";
    }
  }

  return (
    <>
      <Modal
        open={open}
        title={detail?.title || "Details"}
        onClose={onClose}
        size="xl"
      >
        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading details...</div>
        ) : !detail || detail.rows.length === 0 ? (
          <div className="space-y-4">
            {canManage && addLink && (
              <Link href={addLink.href}>
                <Button type="button" size="sm" variant="secondary">
                  <Plus size={14} className="mr-1" />
                  {addLink.label}
                </Button>
              </Link>
            )}
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-12 text-center text-slate-500">
              No records found for this category yet.
            </div>
          </div>
        ) : (
          <>
            {renderToolbar()}

            <div className="overflow-x-auto max-h-[60vh]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column} className="px-3 py-2 whitespace-nowrap">
                        {COLUMN_LABELS[column] || column}
                      </th>
                    ))}
                    {showActionsColumn && (
                      <th className="px-3 py-2 whitespace-nowrap">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((row, index) => {
                    const deleteConfig = getDeleteConfig(
                      detail.type,
                      row,
                      userRole,
                      userPermissions
                    );
                    const isDuplicate = row.scan_status === "Duplicate";
                    const editHref =
                      row.employee_id && detail.type.startsWith("face_")
                        ? `/employees?highlight=${row.employee_id}`
                        : row.id && detail.type === "cameras"
                          ? `/cameras/${row.id}`
                          : null;

                    return (
                      <tr
                        key={String(row.id ?? row.record_id ?? row.log_id ?? index)}
                        className={`border-t border-slate-100 dark:border-slate-800 ${
                          isDuplicate ? "bg-amber-500/5 dark:bg-amber-500/10" : ""
                        }`}
                      >
                        {visibleColumns.map((column) => (
                          <td key={column} className="px-3 py-2 whitespace-nowrap">
                            {column === "scan_status" ? (
                              <ScanStatusBadge value={String(row[column] ?? "—")} />
                            ) : (
                              formatCell(String(row[column] ?? "—"), column)
                            )}
                          </td>
                        ))}
                        {showActionsColumn && (
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {editHref && (
                                <Link
                                  href={editHref}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                >
                                  <ExternalLink size={13} />
                                  Open
                                </Link>
                              )}
                              {deleteConfig ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(deleteConfig)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                  Delete
                                </button>
                              ) : (
                                !editHref && <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                {detail.rows.length} record{detail.rows.length === 1 ? "" : "s"}
              </p>
            </div>
          </>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Record"
        message={`Delete ${deleteTarget?.label}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => !deleting && setDeleteTarget(null)}
      />

      <ConfirmModal
        open={!!bulkAction}
        title={bulkConfirmTitle()}
        message={bulkConfirmMessage()}
        confirmLabel="Confirm"
        loading={deleting}
        onConfirm={() => void confirmBulkAction()}
        onClose={() => !deleting && setBulkAction(null)}
      />
    </>
  );
}

function ScanStatusBadge({ value }: { value: string }) {
  if (value === "Duplicate") {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        Duplicate
      </span>
    );
  }
  if (value === "First scan") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        First scan
      </span>
    );
  }
  return <span>{value}</span>;
}

function formatCell(value: string, column?: string) {
  if (
    (column === "late_minutes" || column === "late") &&
    value !== "" &&
    value !== "—"
  ) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return formatDurationMinutes(parsed);
    return value;
  }
  if (value === "NOT_CHECKED_IN") return "Not checked in";
  if (value === "FULL_DAY") return "Full Day";
  if (value === "HALF_DAY") return "Half Day";
  if (value === "ABSENT") return "Absent";
  if (value === "ONLINE") return "Online";
  if (value === "OFFLINE") return "Offline";
  return value;
}
