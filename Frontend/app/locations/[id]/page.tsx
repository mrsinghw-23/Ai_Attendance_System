"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  useParams,
} from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Camera,
  MapPin,
  Users,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Badge, {
  formatStatusLabel,
  getStatusBadgeVariant,
} from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useToast } from "@/providers/ToastProvider";
import { LocationWithStats } from "@/types/location";

interface LocationEmployee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  department: string | null;
  designation: string | null;
  status: string;
}

interface LocationCamera {
  id: number;
  camera_name: string;
  camera_ip: string | null;
  status: string;
}

interface LocationDetail
  extends LocationWithStats {
  employees: LocationEmployee[];
  cameras: LocationCamera[];
}

export default function LocationDetailPage() {
  const params = useParams();
  const { showToast } = useToast();
  const locationId = Number(params.id);

  const [location, setLocation] =
    useState<LocationDetail | null>(null);
  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function load() {
      if (Number.isNaN(locationId)) {
        setLoading(false);
        return;
      }

      const response = await fetch(
        `/api/locations/${locationId}`
      );
      const data = await response.json();

      if (data.success) {
        setLocation(data.data);
      } else {
        showToast(
          data.message ||
            "Location not found",
          "error"
        );
      }

      setLoading(false);
    }

    load();
  }, [locationId, showToast]);

  if (loading) {
    return (
      <DashboardLayout
        title="Location Dashboard"
        module="locations"
      >
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
          <div className="h-80 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  if (!location) {
    return (
      <DashboardLayout
        title="Location Dashboard"
        module="locations"
      >
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500">
            Location not found.
          </p>
          <Link
            href="/locations"
            className="inline-block mt-4"
          >
            <Button variant="secondary">
              Back to Locations
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Location Dashboard"
      module="locations"
    >
      <div className="space-y-6">
        <Link
          href="/locations"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft
            size={16}
            className="mr-2"
          />
          Back to Locations
        </Link>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/30 p-3 text-blue-600 dark:text-blue-300">
              <Building2 size={26} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {location.location_name}
              </h3>
              <p className="flex items-center gap-1 text-slate-500">
                <MapPin size={14} />
                {[
                  location.city,
                  location.state,
                ]
                  .filter(Boolean)
                  .join(", ") ||
                  "No address"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-2 gap-4">
            <StatCard
              icon={<Users size={18} />}
              label="Total Employees"
              value={location.employee_count}
              tone="blue"
            />
            <StatCard
              icon={<Camera size={18} />}
              label="Total Cameras"
              value={location.camera_count}
              tone="emerald"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={16} />
                Assigned Employees
              </h4>
              <Badge variant="info">
                {location.employees.length}
              </Badge>
            </div>

            {location.employees.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No employees assigned to this
                location.
              </p>
            ) : (
              <div className="space-y-2">
                {location.employees.map(
                  (employee) => (
                    <Link
                      key={employee.id}
                      href={`/employees/${employee.id}`}
                      className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {employee.first_name}{" "}
                          {employee.last_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {employee.employee_code}{" "}
                          ·{" "}
                          {employee.designation ||
                            employee.department ||
                            "No role"}
                        </p>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(
                          employee.status
                        )}
                      >
                        {formatStatusLabel(
                          employee.status
                        )}
                      </Badge>
                    </Link>
                  )
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Camera size={16} />
                Assigned Cameras
              </h4>
              <Badge variant="info">
                {location.cameras.length}
              </Badge>
            </div>

            {location.cameras.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No cameras assigned to this
                location.
              </p>
            ) : (
              <div className="space-y-2">
                {location.cameras.map(
                  (camera) => (
                    <div
                      key={camera.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {camera.camera_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {camera.camera_ip ||
                            "No IP"}
                        </p>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(
                          (
                            camera.status ||
                            ""
                          ).toUpperCase()
                        )}
                      >
                        {camera.status ||
                          "Unknown"}
                      </Badge>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
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
  tone: "blue" | "emerald";
}) {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300",
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300",
  };

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4">
      <div
        className={`inline-flex rounded-lg p-2 ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="text-sm text-slate-500">
        {label}
      </p>
    </div>
  );
}
