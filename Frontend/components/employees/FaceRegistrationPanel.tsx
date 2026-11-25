"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Trash2,
  Upload,
  AlertTriangle,
  Monitor,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal, { ConfirmModal } from "@/components/ui/Modal";
import LiveFaceEnrollment from "@/components/employees/LiveFaceEnrollment";
import WebcamFaceScanFeed from "@/components/employees/WebcamFaceScanFeed";
import type { CctvFaceScanFeedHandle } from "@/components/employees/CctvFaceScanFeed";
import { useToast } from "@/providers/ToastProvider";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { cropFileToOvalFace } from "@/lib/live-face-enrollment";
import {
  EmployeeFaceProfile,
  FaceImageType,
  REQUIRED_FACE_TYPES,
} from "@/types/face-registration";
const TYPE_LABELS: Record<FaceImageType, string> = {
  FRONT: "Front Face",
  LEFT: "Left Face",
  RIGHT: "Right Face",
  UP: "Up Face",
  DOWN: "Down Face",
  ADDITIONAL: "Additional",
};

interface FaceRegistrationPanelProps {
  employeeId: number;
  canManage: boolean;
  canDelete?: boolean;
  autoStartLive?: boolean;
}

export default function FaceRegistrationPanel({
  employeeId,
  canManage,
  canDelete = false,
  autoStartLive = false,
}: FaceRegistrationPanelProps) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<EmployeeFaceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<FaceImageType>("FRONT");
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(autoStartLive);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [syncingEmbeddings, setSyncingEmbeddings] = useState(false);
  const [aiScannable, setAiScannable] = useState<boolean | null>(null);
  const webcamScannerRef = useRef<CctvFaceScanFeedHandle | null>(null);
  const autoCaptureWebcamRef = useRef<() => void>(() => {});
  const capturingWebcamRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    const res = await fetch(`/api/face-registration/employees/${employeeId}`);
    const data = await res.json();
    if (data.success) {
      setProfile(data.data);
      setAiScannable(
        typeof data.data.ai_scannable === "boolean"
          ? data.data.ai_scannable
          : null
      );
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useRealtimeEvents(
    ["face_registration.updated", "face_registration.live_completed"],
    (event) => {
      const eventEmployeeId = Number(event.payload.employeeId);
      if (eventEmployeeId === employeeId) {
        void loadProfile();
      }
    }
  );

  async function handleSyncEmbeddings() {
    setSyncingEmbeddings(true);
    try {
      const res = await fetch(
        `/api/face-registration/employees/${employeeId}/sync-embeddings`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.success) {
        setAiScannable(true);
        showToast(data.message || "AI embeddings synced", "success");
        await loadProfile();
      } else {
        showToast(
          data.message || "Embedding sync failed — check AI Python service",
          "error"
        );
      }
    } catch {
      showToast("Could not sync AI embeddings", "error");
    } finally {
      setSyncingEmbeddings(false);
    }
  }

  async function uploadBlob(
    blob: Blob,
    imageType: FaceImageType,
    quality: number,
    replaceId?: number
  ) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", blob, `${imageType.toLowerCase()}.jpg`);
      formData.append("image_type", imageType);
      formData.append("live_quality_score", String(quality));
      if (replaceId) formData.append("replace_image_id", String(replaceId));

      const url = replaceId
        ? `/api/face-registration/images/${replaceId}`
        : `/api/face-registration/employees/${employeeId}/images`;

      const res = await fetch(url, {
        method: replaceId ? "PUT" : "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        await loadProfile();
        const synced = data.data.embeddingsSynced;
        showToast(
          synced
            ? "Face saved — AI embeddings synced to database"
            : "Face saved but AI sync failed — click Sync AI Embeddings",
          synced ? "success" : "error"
        );
      } else {
        showToast(data.message || "Upload failed", "error");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not save face",
        "error"
      );
    } finally {
      setUploading(false);
    }
  }

  async function completeManualQuickRegistration(blob: Blob, quality: number) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", blob, "front.jpg");
      formData.append("live_quality_score", String(quality));

      const res = await fetch(
        `/api/face-registration/employees/${employeeId}/manual-quick-complete`,
        { method: "POST", body: formData }
      );
      const data = await res.json();

      if (data.success) {
        await loadProfile();
        showToast(
          data.message || "Face registration 100% complete",
          data.data?.embeddingsSynced ? "success" : "error"
        );
        closeWebcamCapture();
      } else {
        showToast(data.message || "Could not complete registration", "error");
      }
    } catch {
      showToast("Could not complete registration", "error");
    } finally {
      setUploading(false);
      capturingWebcamRef.current = false;
    }
  }

  async function uploadFile(file: File, imageType: FaceImageType, replaceId?: number) {
    setUploading(true);
    try {
      const ovalFile = await cropFileToOvalFace(file);
      const formData = new FormData();
      formData.append("image", ovalFile);
      formData.append("image_type", imageType);
      if (replaceId) formData.append("replace_image_id", String(replaceId));

      const url = replaceId
        ? `/api/face-registration/images/${replaceId}`
        : `/api/face-registration/employees/${employeeId}/images`;

      const res = await fetch(url, {
        method: replaceId ? "PUT" : "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        await loadProfile();
        const synced = data.data.embeddingsSynced;
        showToast(
          synced
            ? "Face saved — AI embeddings synced to database"
            : "Face saved but AI sync failed — click Sync AI Embeddings",
          synced ? "success" : "error"
        );
      } else {
        showToast(data.message || "Upload failed", "error");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not crop face oval",
        "error"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(imageId: number, label: string) {
    setDeleteTarget({ id: imageId, label });
  }

  async function confirmDeleteImage() {
    if (!deleteTarget) return;
    setDeleting(true);

    const res = await fetch(`/api/face-registration/images/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (data.success) {
      await loadProfile();
      showToast("Face image deleted", "success");
      setDeleteTarget(null);
    } else {
      showToast(data.message || "Delete failed", "error");
    }

    setDeleting(false);
  }

  const canRemoveImages = canManage || canDelete;

  function toggleSelected(imageId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  }

  function selectAllImages() {
    setSelectedIds(new Set(profile?.images.map((image) => image.id) || []));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function confirmBulkDelete() {
    if (!selectedIds.size) return;
    setDeleting(true);

    const res = await fetch(
      `/api/face-registration/employees/${employeeId}/images/bulk-delete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_ids: [...selectedIds] }),
      }
    );
    const data = await res.json();

    if (data.success) {
      setProfile(data.data);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      showToast(data.message || "Face images deleted", "success");
    } else {
      showToast(data.message || "Delete failed", "error");
    }

    setDeleting(false);
  }

  function openWebcamCapture() {
    setWebcamOpen(true);
  }

  function closeWebcamCapture() {
    setWebcamOpen(false);
  }

  async function captureFromWebcam() {
    if (uploading || capturingWebcamRef.current) return;

    const scanner = webcamScannerRef.current;

    if (!scanner?.faceDetected) {
      showToast("Put your face inside the oval to capture.", "error");
      return;
    }

    capturingWebcamRef.current = true;
    setUploading(true);

    try {
      const capture = await scanner?.captureFaceBlob();
      if (!capture?.blob) {
        showToast(
          "Could not capture face. Move closer, align in the oval, and hold still.",
          "error"
        );
        return;
      }

      const quality = Math.max(capture.quality, 0.55);

      if (selectedType === "FRONT") {
        await completeManualQuickRegistration(capture.blob, quality);
        return;
      }

      closeWebcamCapture();
      await uploadBlob(capture.blob, selectedType, quality);
    } finally {
      capturingWebcamRef.current = false;
      setUploading(false);
    }
  }

  autoCaptureWebcamRef.current = () => {
    if (!uploading && !capturingWebcamRef.current && webcamOpen) {
      void captureFromWebcam();
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500">
        Loading face registration...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-500">
        Unable to load face registration profile.
      </div>
    );
  }

  const statusVariant =
    profile.profile_status === "FULLY_REGISTERED"
      ? "success"
      : profile.profile_status === "PARTIALLY_REGISTERED"
        ? "warning"
        : "neutral";

  const progress = Math.min(
    100,
    Math.round((profile.image_count / profile.required_count) * 100)
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
              Face Registration Status
            </h4>
            <p className="text-sm text-slate-500 mt-1">
              Minimum {profile.required_count} samples · Recommended{" "}
              {profile.recommended_count}
            </p>
          </div>
          <Badge variant={statusVariant}>
            {formatStatus(profile.profile_status)}
          </Badge>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-slate-500 mb-2">
            <span>
              {profile.image_count} / {profile.required_count} required samples
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {profile.profile_status === "FULLY_REGISTERED" &&
        (profile.ai_readiness === "SYNC_PENDING" || aiScannable === false) && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Face poses saved — AI sync pending
              </p>
              <p className="text-sm text-amber-800/80 dark:text-amber-200/80 mt-1">
                Registration is complete but camera attendance needs AI embeddings in the
                database. Click sync below (requires Python AI service).
              </p>
            </div>
          </div>
          {canManage && (
            <Button
              variant="secondary"
              onClick={handleSyncEmbeddings}
              disabled={syncingEmbeddings}
            >
              {syncingEmbeddings ? "Syncing…" : "Sync AI Embeddings"}
            </Button>
          )}
        </div>
      )}

      {canManage && (
        <div
          id="live-face-enrollment"
          className="rounded-2xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-6 space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">
                Live Face Enrollment
              </h4>
              <p className="text-sm text-slate-500 mt-1">
                Uses your PC webcam — Front, Left, Right, Up with auto face scan
              </p>
              <a
                href="#manual-face-upload"
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline mt-2 inline-block"
              >
                Capture one pose from PC camera instead →
              </a>
            </div>
            <Button onClick={() => setLiveOpen(true)} disabled={uploading}>
              <Camera size={16} className="mr-2" />
              Start Face Registration
            </Button>
          </div>
        </div>
      )}

      {canManage && (
        <div
          id="manual-face-upload"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-6 space-y-4 scroll-mt-24"
        >
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white">
              Manual Upload (Optional)
            </h4>
            <a
              href="#live-face-enrollment"
              className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline mt-1 inline-block"
            >
              ← Use guided live registration for all 4 poses
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_FACE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                  selectedType === type
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedType("ADDITIONAL")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                selectedType === "ADDITIONAL"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {TYPE_LABELS.ADDITIONAL}
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} className="mr-2" />
              Upload {TYPE_LABELS[selectedType]}
            </Button>
            <Button disabled={uploading} onClick={openWebcamCapture}>
              <Monitor size={16} className="mr-2" />
              Capture From PC Camera
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await uploadFile(file, selectedType);
              event.target.value = "";
            }}
          />

          <p className="text-xs text-slate-500 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <strong>Front Face quick register:</strong> open PC camera — as soon as
            your face enters the oval it captures and completes registration (4/4).
            Other pose tabs save one image when the face is in the oval.
          </p>
        </div>
      )}

      {profile.images.length > 0 && canRemoveImages && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={selectAllImages}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <span className="text-xs text-slate-500">
              {selectedIds.size} selected
            </span>
          </div>
          <Button
            variant="danger"
            size="sm"
            disabled={selectedIds.size === 0 || deleting}
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 size={14} className="mr-1" />
            Delete selected
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {profile.images.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-500">
            No face images registered yet.
          </div>
        ) : (
          profile.images.map((image) => {
            const isSelected = selectedIds.has(image.id);
            return (
            <div
              key={image.id}
              className={`rounded-2xl border overflow-hidden bg-white dark:bg-slate-900 ${
                isSelected
                  ? "border-blue-500 ring-2 ring-blue-500/30"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 relative">
                {canRemoveImages && (
                  <label className="absolute top-2 left-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/50 backdrop-blur-sm">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(image.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </label>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.image_path}
                  alt={TYPE_LABELS[image.image_type]}
                  className="h-full w-full object-cover"
                />
                {image.quality_score >= 0.7 && (
                  <span className="absolute top-2 right-2 rounded-full bg-emerald-500/90 p-1 text-white">
                    <CheckCircle2 size={14} />
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {TYPE_LABELS[image.image_type]}
                    </p>
                    <p className="text-xs text-slate-500">
                      Quality {Math.round(image.quality_score * 100)}% ·{" "}
                      {new Date(image.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {(canManage || canDelete) && (
                    <div className="flex gap-1">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedType(image.image_type);
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/jpeg,image/png,image/webp";
                            input.onchange = async () => {
                              const file = input.files?.[0];
                              if (file) await uploadFile(file, image.image_type, image.id);
                            };
                            input.click();
                          }}
                        >
                          <ImagePlus size={15} />
                        </Button>
                      )}
                      {canRemoveImages && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDelete(
                              image.id,
                              TYPE_LABELS[image.image_type]
                            )
                          }
                          title="Delete image"
                        >
                          <Trash2 size={15} className="text-red-500" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      <LiveFaceEnrollment
        employeeId={employeeId}
        open={liveOpen}
        onClose={() => setLiveOpen(false)}
        onComplete={() => {
          void loadProfile();
          setLiveOpen(false);
        }}
      />

      <Modal
        open={webcamOpen}
        title={
          selectedType === "FRONT"
            ? "PC Camera — Quick Register (100%)"
            : `PC Camera — ${TYPE_LABELS[selectedType]}`
        }
        onClose={closeWebcamCapture}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeWebcamCapture}>
              Cancel
            </Button>
            <Button
              onClick={() => void captureFromWebcam()}
              disabled={uploading}
            >
              {selectedType === "FRONT"
                ? "Save & Complete 100%"
                : "Capture Face"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <WebcamFaceScanFeed
            enabled={webcamOpen}
            scannerRef={webcamScannerRef}
            poseTarget={selectedType === "ADDITIONAL" ? "FRONT" : selectedType}
            manualQuickMode={selectedType === "FRONT"}
            ovalInstantCapture
            autoCapture
            capturePaused={uploading}
            onAutoCapture={() => autoCaptureWebcamRef.current()}
            className="aspect-video min-h-[280px]"
          />
          <p className="text-xs text-slate-500">
            {selectedType === "FRONT" ? (
              <>
                Face enters the oval → <strong>captures instantly</strong> and
                completes registration (4/4). Or click Save &amp; Complete when
                your face is visible.
              </>
            ) : (
              <>
                Face enters the oval → captures instantly. Or click Capture Face
                when your face is visible.
              </>
            )}
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={bulkDeleteOpen}
        title="Delete Selected Face Images"
        message={`Delete ${selectedIds.size} selected face image(s)? This cannot be undone.`}
        confirmLabel="Delete all selected"
        loading={deleting}
        onConfirm={() => void confirmBulkDelete()}
        onClose={() => !deleting && setBulkDeleteOpen(false)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Face Image"
        message={`Delete ${deleteTarget?.label}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDeleteImage()}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
