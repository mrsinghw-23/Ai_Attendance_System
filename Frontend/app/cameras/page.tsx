"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Activity,
  Camera as CameraIcon,
  CircleDot,
  Edit,
  Monitor,
  Plus,
  Power,
  Trash2,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal, {
  ConfirmModal,
} from "@/components/ui/Modal";
import CameraForm from "@/components/cameras/CameraForm";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canManageCameras, canDeleteRecords } from "@/utils/permissions";
import CameraOperationsPanel from "@/components/cameras/CameraOperationsPanel";
import CameraMapView from "@/components/cameras/CameraMapView";
import PcWebcamPanel from "@/components/cameras/PcWebcamPanel";
import {
  CreateCameraInput,
  UpdateCameraInput,
} from "@/schemas/camera.schema";
import {
  Camera,
  CameraStats,
  LocationCameraReport,
} from "@/types/camera";
import { Location } from "@/types/location";

const EMPTY_STATS: CameraStats = {
  total: 0,
  active: 0,
  inactive: 0,
  online: 0,
  offline: 0,
  warning: 0,
  maintenance: 0,
  errors: 0,
  recording: 0,
};

function healthBadge(health: string) {
  if (health === "ONLINE") {
    return (
      <Badge variant="success">
        <Wifi size={11} className="mr-1" />
        Online
      </Badge>
    );
  }
  if (health === "OFFLINE") {
    return (
      <Badge variant="danger">
        <WifiOff size={11} className="mr-1" />
        Offline
      </Badge>
    );
  }
  if (health === "WARNING") {
    return <Badge variant="warning">Warning</Badge>;
  }
  if (health === "MAINTENANCE") {
    return <Badge variant="neutral">Maintenance</Badge>;
  }
  return <Badge variant="neutral">Unknown</Badge>;
}

function streamStatusBadge(camera: Camera) {
  if (camera.status === "INACTIVE") {
    return (
      <Badge variant="neutral">
        <Power size={11} className="mr-1" />
        Disabled
      </Badge>
    );
  }
  return healthBadge(camera.health_status);
}

export default function CamerasPage() {
  const { showToast } = useToast();
  const { user } = useCurrentUser();
  const canManage = user
    ? canManageCameras(user.role, user.permissions)
    : false;
  const canDelete = user ? canDeleteRecords(user.role) : false;

  const [activeTab, setActiveTab] = useState<
    "list" | "operations" | "map"
  >("list");

  const [cameras, setCameras] = useState<
    Camera[]
  >([]);
  const [stats, setStats] =
    useState<CameraStats>(EMPTY_STATS);
  const [report, setReport] = useState<
    LocationCameraReport[]
  >([]);
  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [deleting, setDeleting] =
    useState(false);
  const [formOpen, setFormOpen] =
    useState(false);
  const [editTarget, setEditTarget] =
    useState<Camera | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<Camera | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("");
  const [locationFilter, setLocationFilter] =
    useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter)
      params.set("status", statusFilter);
    if (locationFilter)
      params.set(
        "location_id",
        locationFilter
      );

    const [
      camerasRes,
      statsRes,
    ] = await Promise.all([
      fetch(
        `/api/cameras?${params.toString()}`
      ),
      fetch("/api/cameras/stats"),
    ]);

    const camerasData =
      await camerasRes.json();
    const statsData = await statsRes.json();

    if (camerasData.success) {
      setCameras(camerasData.data);
    } else {
      showToast(
        camerasData.message ||
          "Failed to load cameras",
        "error"
      );
    }

    if (statsData.success) {
      setStats(statsData.data.stats);
      setReport(
        statsData.data.locationReport
      );
    }

    setLoading(false);
  }, [
    search,
    statusFilter,
    locationFilter,
    showToast,
  ]);

  useEffect(() => {
    async function loadLocations() {
      const res = await fetch(
        "/api/locations"
      );
      const data = await res.json();
      if (data.success)
        setLocations(data.data);
    }
    loadLocations();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(
      fetchData,
      300
    );
    return () => clearTimeout(timeout);
  }, [fetchData]);

  async function handleSubmit(
    values: CreateCameraInput | UpdateCameraInput
  ) {
    setSaving(true);
    const url = editTarget
      ? `/api/cameras/${editTarget.id}`
      : "/api/cameras";
    const method = editTarget ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });
    const data = await res.json();

    if (data.success) {
      showToast(
        editTarget
          ? "Camera updated"
          : "Camera created",
        "success"
      );
      setFormOpen(false);
      setEditTarget(null);
      fetchData();
    } else {
      showToast(
        data.message ||
          "Failed to save camera",
        "error"
      );
    }
    setSaving(false);
  }

  async function toggleStatus(
    camera: Camera
  ) {
    const next =
      camera.status === "ACTIVE"
        ? "INACTIVE"
        : "ACTIVE";

    const res = await fetch(
      `/api/cameras/${camera.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          status: next,
        }),
      }
    );
    const data = await res.json();

    if (data.success) {
      showToast(
        `Camera ${next === "ACTIVE" ? "enabled" : "disabled"}`,
        "success"
      );
      fetchData();
    } else {
      showToast(
        data.message ||
          "Failed to update camera",
        "error"
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const res = await fetch(
      `/api/cameras/${deleteTarget.id}`,
      { method: "DELETE" }
    );
    const data = await res.json();

    if (data.success) {
      showToast("Camera deleted", "success");
      setDeleteTarget(null);
      fetchData();
    } else {
      showToast(
        data.message ||
          "Failed to delete camera",
        "error"
      );
    }
    setDeleting(false);
  }

  return (
    <DashboardLayout
      title="Camera Management"
      module="cameras"
      actions={
        canManage && activeTab === "list" ? (
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus
              size={16}
              className="mr-2"
            />
            Add Camera
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
          <StatCard
            icon={<Monitor size={18} />}
            label="PC Webcam"
            value={1}
            tone="violet"
          />
          <StatCard
            icon={<CameraIcon size={18} />}
            label="CCTV Cameras"
            value={stats.total}
            tone="blue"
          />
          <StatCard
            icon={<Wifi size={18} />}
            label="Online"
            value={stats.online}
            tone="emerald"
          />
          <StatCard
            icon={<WifiOff size={18} />}
            label="Offline"
            value={stats.offline}
            tone="rose"
          />
          <StatCard
            icon={<Activity size={18} />}
            label="Errors"
            value={stats.errors}
            tone="rose"
          />
          <StatCard
            icon={<CircleDot size={18} />}
            label="Warning"
            value={stats.warning}
            tone="violet"
          />
          <StatCard
            icon={<Power size={18} />}
            label="Maintenance"
            value={stats.maintenance}
            tone="blue"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: "list", label: "Camera List" },
            { id: "operations", label: "Live Operations" },
            { id: "map", label: "Map View" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(tab.id as "list" | "operations" | "map")
              }
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "operations" && <CameraOperationsPanel />}
        {activeTab === "map" && <CameraMapView />}

        {activeTab === "list" && (
          <>
        <PcWebcamPanel
          variant="compact"
          showScanner={false}
          showDetailsLink
        />

        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            CCTV Cameras
          </h4>
          {canManage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus size={14} className="mr-1" />
              Add CCTV Camera
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            placeholder="Search name, IP, RTSP..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">
              All Statuses
            </option>
            <option value="ACTIVE">
              Active
            </option>
            <option value="INACTIVE">
              Inactive
            </option>
          </select>
          <select
            value={locationFilter}
            onChange={(e) =>
              setLocationFilter(e.target.value)
            }
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">
              All Locations
            </option>
            {locations.map((location) => (
              <option
                key={location.id}
                value={location.id}
              >
                {location.location_name}
              </option>
            ))}
          </select>
        </div>

        {/* Camera grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map(
              (_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse"
                />
              )
            )}
          </div>
        ) : cameras.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
            <CameraIcon
              className="mx-auto mb-3 text-slate-400"
              size={32}
            />
            <p className="font-medium text-slate-700 dark:text-slate-200">
              No CCTV cameras configured
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Your PC webcam above is active for attendance. Add a CCTV camera
              only if you need gate/RTSP monitoring later.
            </p>
            {canManage && (
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={16} className="mr-2" />
                Add CCTV Camera
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cameras.map((camera) => (
              <div
                key={camera.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300">
                      <CameraIcon size={20} />
                    </div>
                    <div>
                      <Link
                        href={`/cameras/${camera.id}`}
                        className="font-semibold text-slate-900 dark:text-white hover:text-blue-600"
                      >
                        {camera.camera_name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {camera.camera_ip ||
                          "No IP"}{" "}
                        ·{" "}
                        {camera.location_name ||
                          "Unassigned"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      camera.status ===
                      "ACTIVE"
                        ? "success"
                        : "neutral"
                    }
                  >
                    {camera.status ===
                    "ACTIVE"
                      ? "Active"
                      : "Inactive"}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {streamStatusBadge(camera)}
                  {camera.recording_status ===
                    "RECORDING" && (
                    <Badge variant="danger">
                      <CircleDot
                        size={11}
                        className="mr-1"
                      />
                      REC
                    </Badge>
                  )}
                </div>

                {camera.rtsp_url && (
                  <p className="mt-3 truncate text-xs text-slate-400 font-mono">
                    {camera.rtsp_url}
                  </p>
                )}

                {(canManage || canDelete) && (
                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {canManage && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            toggleStatus(camera)
                          }
                        >
                          <Power
                            size={14}
                            className="mr-1"
                          />
                          {camera.status ===
                          "ACTIVE"
                            ? "Disable"
                            : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditTarget(camera);
                            setFormOpen(true);
                          }}
                        >
                          <Edit size={15} />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDeleteTarget(
                            camera
                          )
                        }
                      >
                        <Trash2
                          size={15}
                          className="text-red-500"
                        />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Location-wise report */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
            Location-wise Camera Report
          </h4>
          {report.length === 0 ? (
            <p className="text-sm text-slate-500">
              No CCTV locations. PC webcam is active for all locations.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">
                      Location
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      Total
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      Active
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      Online
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((row) => (
                    <tr
                      key={row.location_id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 pr-4 text-slate-900 dark:text-white font-medium">
                        {row.location_name}
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {row.total}
                      </td>
                      <td className="py-2 pr-4 text-emerald-600">
                        {row.active}
                      </td>
                      <td className="py-2 pr-4 text-blue-600">
                        {row.online}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      <Modal
        open={formOpen}
        size="xl"
        title={
          editTarget
            ? "Edit Camera"
            : "Add Camera"
        }
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
      >
        <CameraForm
          initialData={editTarget}
          locations={locations}
          loading={saving}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditTarget(null);
          }}
        />
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Camera"
        message={`Delete "${deleteTarget?.camera_name}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
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
  tone: "blue" | "emerald" | "violet" | "rose";
}) {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300",
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300",
    violet:
      "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300",
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5">
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
