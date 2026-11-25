"use client";

import Link from "next/link";
import {
  Edit,
  Eye,
  Trash2,
} from "lucide-react";
import Badge, {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  EmployeeAIReadiness,
  AI_READINESS_LABELS,
} from "@/utils/ai-readiness";
import { Employee } from "@/types/employee";

interface EmployeeTableProps {
  employees: Employee[];
  loading?: boolean;
  canDelete?: boolean;
  onDelete: (employee: Employee) => void;
}

function getFaceScanBadge(employee: Employee): {
  variant: "success" | "warning" | "neutral";
  label: string;
  title: string;
} {
  const readiness = employee.ai_readiness || "NO_FACE";
  const meta = AI_READINESS_LABELS[readiness as EmployeeAIReadiness];

  const variant =
    readiness === "AI_READY"
      ? "success"
      : readiness === "NO_FACE"
        ? "neutral"
        : "warning";

  return {
    variant,
    label: meta?.label || "No Face",
    title: meta?.title || "",
  };
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map(
        (_, index) => (
          <div
            key={index}
            className="h-14 rounded-xl bg-slate-200/70 dark:bg-slate-800 animate-pulse"
          />
        )
      )}
    </div>
  );
}

export default function EmployeeTable({
  employees,
  loading = false,
  canDelete = false,
  onDelete,
}: EmployeeTableProps) {
  if (loading) {
    return <TableSkeleton />;
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
        <p className="text-slate-500 dark:text-slate-400">
          No employees found. Try adjusting
          your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">
              Code
            </th>
            <th className="px-4 py-3 font-medium">
              Employee
            </th>
            <th className="px-4 py-3 font-medium">
              Department
            </th>
            <th className="px-4 py-3 font-medium">
              Location
            </th>
            <th className="px-4 py-3 font-medium">
              Status
            </th>
            <th className="px-4 py-3 font-medium">
              Face Status
            </th>
            <th className="px-4 py-3 font-medium text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr
              key={employee.id}
              className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
            >
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                {employee.employee_code}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900 dark:text-white">
                  {employee.first_name}{" "}
                  {employee.last_name}
                </div>
                <div className="text-xs text-slate-500">
                  {employee.email || "No email"}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                {employee.department || "-"}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                {employee.location_name || "-"}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={getStatusBadgeVariant(
                    employee.status
                  )}
                >
                  {formatStatusLabel(
                    employee.status
                  )}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {(() => {
                  const faceBadge = getFaceScanBadge(employee);
                  return (
                    <span title={faceBadge.title}>
                      <Badge variant={faceBadge.variant}>
                        {faceBadge.label}
                      </Badge>
                    </span>
                  );
                })()}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/employees/${employee.id}`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      title="View profile"
                    >
                      <Eye size={16} />
                    </Button>
                  </Link>
                  <Link
                    href={`/employees/${employee.id}?edit=true`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Edit employee"
                    >
                      <Edit size={16} />
                    </Button>
                  </Link>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Delete employee"
                      onClick={() =>
                        onDelete(employee)
                      }
                    >
                      <Trash2
                        size={16}
                        className="text-red-500"
                      />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
