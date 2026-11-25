"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import EmployeeTable from "@/components/employees/EmployeeTable";
import EmployeeFilters, {
  EmployeeFilterValues,
} from "@/components/employees/EmployeeFilters";
import Button from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canDeleteRecords } from "@/utils/permissions";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { Employee } from "@/types/employee";
import { Location } from "@/types/location";

export default function EmployeesPage() {
  const { showToast } = useToast();
  const { user } = useCurrentUser();
  const canDelete = canDeleteRecords(user?.role || "");
  const [employees, setEmployees] = useState<
    Employee[]
  >([]);
  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [loading, setLoading] =
    useState(true);
  const [deleting, setDeleting] =
    useState(false);
  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);
  const [filters, setFilters] =
    useState<EmployeeFilterValues>({
      search: "",
      status: "",
      department: "",
      location_id: "",
    });
  const [pagination, setPagination] =
    useState({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
    });

  const fetchEmployees = useCallback(
    async (
      page = 1,
      currentFilters = filters
    ) => {
      setLoading(true);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });

      if (currentFilters.search) {
        params.set(
          "search",
          currentFilters.search
        );
      }
      if (currentFilters.status) {
        params.set(
          "status",
          currentFilters.status
        );
      }
      if (currentFilters.department) {
        params.set(
          "department",
          currentFilters.department
        );
      }
      if (currentFilters.location_id) {
        params.set(
          "location_id",
          currentFilters.location_id
        );
      }

      const response = await fetch(
        `/api/employees?${params.toString()}`
      );
      const data = await response.json();

      if (data.success) {
        setEmployees(data.data);
        setPagination(data.pagination);
      } else {
        showToast(
          data.message || "Failed to load employees",
          "error"
        );
      }

      setLoading(false);
    },
    [filters, pagination.limit, showToast]
  );

  useEffect(() => {
    async function loadLocations() {
      const response = await fetch(
        "/api/locations"
      );
      const data = await response.json();

      if (data.success) {
        setLocations(data.data);
      }
    }

    loadLocations();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchEmployees(1, filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters, fetchEmployees]);

  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState === "visible") {
        fetchEmployees(pagination.page, filters);
      }
    }

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [fetchEmployees, pagination.page, filters]);

  useRealtimeEvents(
    [
      "face_registration.updated",
      "face_registration.live_completed",
      "employee.deleted",
    ],
    () => {
      fetchEmployees(pagination.page, filters);
    }
  );

  async function handleDelete() {
    if (!selectedEmployee) {
      return;
    }

    setDeleting(true);

    const response = await fetch(
      `/api/employees/${selectedEmployee.id}`,
      { method: "DELETE" }
    );
    const data = await response.json();

    if (data.success) {
      showToast(
        "Employee deleted successfully",
        "success"
      );
      setSelectedEmployee(null);
      fetchEmployees(pagination.page);
    } else {
      showToast(
        data.message || "Failed to delete employee",
        "error"
      );
    }

    setDeleting(false);
  }

  return (
    <DashboardLayout
      title="Employee Management"
      module="employees"
      actions={
        <Link href="/employees/new">
          <Button>
            <Plus size={16} className="mr-2" />
            Add Employee
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
          <EmployeeFilters
            filters={filters}
            locations={locations}
            onChange={(nextFilters) => {
              setFilters(nextFilters);
              setPagination((current) => ({
                ...current,
                page: 1,
              }));
            }}
          />
        </div>

        <EmployeeTable
          employees={employees}
          loading={loading}
          canDelete={canDelete}
          onDelete={setSelectedEmployee}
        />

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {employees.length} of{" "}
            {pagination.total} employees
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={
                pagination.page <= 1 ||
                loading
              }
              onClick={() =>
                fetchEmployees(
                  pagination.page - 1
                )
              }
            >
              Previous
            </Button>
            <span className="text-sm text-slate-600 dark:text-slate-300 px-2">
              Page {pagination.page} of{" "}
              {pagination.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={
                pagination.page >=
                  pagination.totalPages ||
                loading
              }
              onClick={() =>
                fetchEmployees(
                  pagination.page + 1
                )
              }
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!selectedEmployee}
        title="Delete Employee"
        message={`Are you sure you want to delete ${selectedEmployee?.first_name} ${selectedEmployee?.last_name}? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() =>
          setSelectedEmployee(null)
        }
      />
    </DashboardLayout>
  );
}
