"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  ArrowLeft,
  Edit,
  Mail,
  MapPin,
  Phone,
  ScanFace,
  User,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import EmployeeForm from "@/components/employees/EmployeeForm";
import FaceRegistrationPanel from "@/components/employees/FaceRegistrationPanel";
import Badge, {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  canAccessEmployeeFaceRegistration,
  canPerformLiveFaceRegistration,
  canDeleteRecords,
} from "@/utils/permissions";
import { CreateEmployeeInput } from "@/schemas/employee.schema";
import { Employee } from "@/types/employee";
import { Location } from "@/types/location";

interface ManagerOption {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useCurrentUser();

  const employeeId = Number(params.id);
  const isEditing =
    searchParams.get("edit") === "true";
  const activeTab =
    searchParams.get("tab") === "face" ? "face" : "profile";
  const autoStartLive = searchParams.get("live") === "1";

  const [employee, setEmployee] =
    useState<Employee | null>(null);
  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [managers, setManagers] = useState<
    ManagerOption[]
  >([]);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    async function loadData() {
      if (Number.isNaN(employeeId)) {
        setLoading(false);
        return;
      }

      const [
        employeeResponse,
        locationsResponse,
        managersResponse,
      ] = await Promise.all([
        fetch(`/api/employees/${employeeId}`),
        fetch("/api/locations"),
        fetch("/api/employees/managers"),
      ]);

      const employeeData =
        await employeeResponse.json();
      const locationsData =
        await locationsResponse.json();
      const managersData =
        await managersResponse.json();

      if (employeeData.success) {
        setEmployee(employeeData.data);
      } else {
        showToast(
          employeeData.message ||
            "Employee not found",
          "error"
        );
      }

      if (locationsData.success) {
        setLocations(locationsData.data);
      }

      if (managersData.success) {
        setManagers(managersData.data);
      }

      setLoading(false);
    }

    loadData();
  }, [employeeId, showToast]);

  async function handleUpdate(
    data: CreateEmployeeInput
  ) {
    setSaving(true);

    const response = await fetch(
      `/api/employees/${employeeId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const result = await response.json();

    if (result.success) {
      setEmployee(result.data);
      showToast(
        "Employee updated successfully",
        "success"
      );
      router.replace(
        `/employees/${employeeId}`
      );
    } else {
      showToast(
        result.message ||
          "Failed to update employee",
        "error"
      );
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <DashboardLayout
        title="Employee Profile"
        module="employees"
      >
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
          <div className="h-96 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  if (!employee) {
    return (
      <DashboardLayout
        title="Employee Profile"
        module="employees"
      >
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500">
            Employee not found.
          </p>
          <Link
            href="/employees"
            className="inline-block mt-4"
          >
            <Button variant="secondary">
              Back to Employees
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const canViewFace = canAccessEmployeeFaceRegistration({
    role: user?.role || "",
    permissions: user?.permissions,
    employeeId: employee.id,
    userEmployeeId: user?.employee_id,
    userLocationId: user?.location_id,
    employeeLocationId: employee.location_id,
  });

  const canManageFace = canPerformLiveFaceRegistration({
    role: user?.role || "",
    permissions: user?.permissions,
    employeeId: employee.id,
    userEmployeeId: user?.employee_id,
    userLocationId: user?.location_id,
    employeeLocationId: employee.location_id,
  });

  const canDeleteFace = canDeleteRecords(user?.role || "");

  return (
    <DashboardLayout
      title="Employee Profile"
      module="employees"
      actions={
        !isEditing ? (
          <Link
            href={`/employees/${employee.id}?edit=true`}
          >
            <Button variant="secondary">
              <Edit
                size={16}
                className="mr-2"
              />
              Edit Employee
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <Link
          href="/employees"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft
            size={16}
            className="mr-2"
          />
          Back to Employees
        </Link>

        {!isEditing && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/employees/${employee.id}`}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === "profile"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Profile
            </Link>
            {canViewFace && (
              <Link
                href={`/employees/${employee.id}?tab=face`}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                  activeTab === "face"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                <ScanFace size={16} />
                Face Registration
              </Link>
            )}
          </div>
        )}

        {!isEditing && activeTab === "face" && canViewFace ? (
          <FaceRegistrationPanel
            employeeId={employee.id}
            canManage={canManageFace}
            canDelete={canDeleteFace}
            autoStartLive={autoStartLive}
          />
        ) : !isEditing ? (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">
                    {employee.employee_code}
                  </p>
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
                    {employee.first_name}{" "}
                    {employee.last_name}
                  </h3>
                  <p className="text-slate-500 mt-1">
                    {employee.designation ||
                      "No designation"}{" "}
                    ·{" "}
                    {employee.department ||
                      "No department"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={getStatusBadgeVariant(
                      employee.status
                    )}
                  >
                    {formatStatusLabel(
                      employee.status
                    )}
                  </Badge>
                  <Badge
                    variant={getStatusBadgeVariant(
                      employee.face_registration_status
                    )}
                  >
                    Face:{" "}
                    {formatStatusLabel(
                      employee.face_registration_status
                    )}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <InfoCard
                icon={<Mail size={18} />}
                label="Email"
                value={
                  employee.email ||
                  "Not provided"
                }
              />
              <InfoCard
                icon={<Phone size={18} />}
                label="Mobile"
                value={
                  employee.mobile ||
                  "Not provided"
                }
              />
              <InfoCard
                icon={<MapPin size={18} />}
                label="Location"
                value={
                  employee.location_name ||
                  "Not assigned"
                }
              />
              <InfoCard
                icon={<User size={18} />}
                label="Reporting Manager"
                value={
                  employee.reporting_manager_name ||
                  "Not assigned"
                }
              />
              <InfoCard
                icon={<User size={18} />}
                label="Joining Date"
                value={
                  employee.joining_date ||
                  "Not set"
                }
              />
              <InfoCard
                icon={<User size={18} />}
                label="Created At"
                value={new Date(
                  employee.created_at
                ).toLocaleDateString()}
              />
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6">
            <EmployeeForm
              initialData={employee}
              locations={locations}
              managers={managers}
              loading={saving}
              onSubmit={handleUpdate}
              onCancel={() =>
                router.replace(
                  `/employees/${employee.id}`
                )
              }
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        {icon}
        <span className="text-sm">
          {label}
        </span>
      </div>
      <p className="text-slate-900 dark:text-white font-medium">
        {value}
      </p>
    </div>
  );
}
