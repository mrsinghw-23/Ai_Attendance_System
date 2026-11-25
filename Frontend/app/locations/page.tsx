"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  Building2,
  Camera,
  Edit,
  MapPin,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Button from "@/components/ui/Button";
import Modal, {
  ConfirmModal,
} from "@/components/ui/Modal";
import LocationForm from "@/components/locations/LocationForm";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canDeleteRecords } from "@/utils/permissions";
import { CreateLocationInput } from "@/schemas/location.schema";
import {
  Location,
  LocationWithStats,
} from "@/types/location";

export default function LocationsPage() {
  const { showToast } = useToast();
  const { user } = useCurrentUser();
  const canDelete = canDeleteRecords(user?.role || "");
  const [locations, setLocations] = useState<
    LocationWithStats[]
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
    useState<Location | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<LocationWithStats | null>(null);

  const fetchLocations =
    useCallback(async () => {
      setLoading(true);
      const response = await fetch(
        "/api/locations?stats=true"
      );
      const data = await response.json();
      if (data.success) {
        setLocations(data.data);
      } else {
        showToast(
          data.message ||
            "Failed to load locations",
          "error"
        );
      }
      setLoading(false);
    }, [showToast]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(location: Location) {
    setEditTarget(location);
    setFormOpen(true);
  }

  async function handleSubmit(
    values: CreateLocationInput
  ) {
    setSaving(true);

    const url = editTarget
      ? `/api/locations/${editTarget.id}`
      : "/api/locations";
    const method = editTarget ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });
    const data = await response.json();

    if (data.success) {
      showToast(
        editTarget
          ? "Location updated"
          : "Location created",
        "success"
      );
      setFormOpen(false);
      setEditTarget(null);
      fetchLocations();
    } else {
      showToast(
        data.message ||
          "Failed to save location",
        "error"
      );
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    const response = await fetch(
      `/api/locations/${deleteTarget.id}`,
      { method: "DELETE" }
    );
    const data = await response.json();

    if (data.success) {
      showToast("Location deleted", "success");
      setDeleteTarget(null);
      fetchLocations();
    } else {
      showToast(
        data.message ||
          "Failed to delete location",
        "error"
      );
    }

    setDeleting(false);
  }

  return (
    <DashboardLayout
      title="Location Management"
      module="locations"
      actions={
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-2" />
          Add Location
        </Button>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map(
            (_, i) => (
              <div
                key={i}
                className="h-40 rounded-2xl bg-slate-200/70 dark:bg-slate-800 animate-pulse"
              />
            )
          )}
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <Building2
            className="mx-auto mb-3 text-slate-400"
            size={32}
          />
          <p className="text-slate-500">
            No locations yet. Create your first
            location to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {locations.map((location) => (
            <div
              key={location.id}
              className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 p-2.5 text-blue-600 dark:text-blue-300">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {location.location_name}
                    </h3>
                    <p className="flex items-center gap-1 text-sm text-slate-500">
                      <MapPin size={13} />
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

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() =>
                      openEdit(location)
                    }
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Edit"
                  >
                    <Edit size={15} />
                  </button>
                  {canDelete && (
                    <button
                      onClick={() =>
                        setDeleteTarget(location)
                      }
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Users size={13} />
                    Employees
                  </div>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {location.employee_count}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Camera size={13} />
                    Cameras
                  </div>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {location.camera_count}
                  </p>
                </div>
              </div>

              <Link
                href={`/locations/${location.id}`}
                className="mt-4 block"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  View Dashboard
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        title={
          editTarget
            ? "Edit Location"
            : "Add Location"
        }
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
      >
        <LocationForm
          initialData={editTarget}
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
        title="Delete Location"
        message={`Delete "${deleteTarget?.location_name}"? This cannot be undone. Locations with assigned employees or cameras cannot be deleted.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
