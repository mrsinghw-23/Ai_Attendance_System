"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Monitor, RefreshCw, ScanFace } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/providers/ToastProvider";
import {
  EmployeeFaceProfile,
  FaceImageType,
  REQUIRED_FACE_TYPES,
} from "@/types/face-registration";
import {
  WebcamFaceScanFeedView,
  useWebcamFaceScanner,
} from "@/components/employees/WebcamFaceScanFeed";
import type { CctvFaceScanFeedHandle } from "@/components/employees/CctvFaceScanFeed";
import {
  LIVE_ENROLLMENT_STEPS,
  MIN_LIVE_QUALITY,
  createSessionId,
} from "@/lib/live-face-enrollment";

interface CapturedStep {
  imageId?: number;
  quality: number;
  previewUrl?: string;
}

interface LiveFaceEnrollmentProps {
  employeeId: number;
  open: boolean;
  onClose: () => void;
  onComplete: (profile: EmployeeFaceProfile) => void;
}

export default function LiveFaceEnrollment({
  employeeId,
  open,
  onClose,
  onComplete,
}: LiveFaceEnrollmentProps) {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<CctvFaceScanFeedHandle | null>(null);
  const capturingRef = useRef(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [sessionId] = useState(() => createSessionId());
  const [captured, setCaptured] = useState<
    Partial<Record<FaceImageType, CapturedStep>>
  >({});
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const currentStep =
    LIVE_ENROLLMENT_STEPS[
      Math.min(stepIndex, LIVE_ENROLLMENT_STEPS.length - 1)
    ];

  const captureStepRef = useRef<() => void>(() => {});

  const scanner = useWebcamFaceScanner({
    enabled: open && sessionReady,
    videoRef,
    poseTarget: currentStep.type,
    autoCapture: true,
    capturePaused: uploading,
    onAutoCapture: () => captureStepRef.current(),
  });

  const completedCount = REQUIRED_FACE_TYPES.filter((type) => captured[type]).length;
  const stepProgress = captured[currentStep.type] ? 100 : scanner.stepProgress;

  const registrationProgress = useMemo(() => {
    const stepsTotal = LIVE_ENROLLMENT_STEPS.length;
    let sum = 0;

    LIVE_ENROLLMENT_STEPS.forEach((step, index) => {
      if (captured[step.type]) {
        sum += 1;
      } else if (index === stepIndex) {
        sum += stepProgress / 100;
      }
    });

    return Math.min(100, Math.round((sum / stepsTotal) * 100));
  }, [captured, stepIndex, stepProgress]);

  const uploadCapture = useCallback(
    async (
      blob: Blob,
      imageType: FaceImageType,
      quality: number,
      replaceId?: number
    ) => {
      const formData = new FormData();
      formData.append("image", blob, `${imageType.toLowerCase()}.jpg`);
      formData.append("image_type", imageType);
      formData.append("live_session_id", sessionId);
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
      if (!data.success) {
        throw new Error(data.message || "Failed to save capture");
      }
      return data.data;
    },
    [employeeId, sessionId]
  );

  const captureCurrentStep = useCallback(async () => {
    if (capturingRef.current) return;

    capturingRef.current = true;
    setUploading(true);

    try {
      const capture = await scanner.captureFaceBlob();
      if (!capture.blob) {
        throw new Error(
          "Could not capture face. Move closer, align in the oval, and hold still."
        );
      }

      const existing = captured[currentStep.type];
      const result = await uploadCapture(
        capture.blob,
        currentStep.type,
        capture.quality,
        existing?.imageId
      );

      const previewUrl = URL.createObjectURL(capture.blob);
      setCaptured((prev) => ({
        ...prev,
        [currentStep.type]: {
          imageId: result.image.id,
          quality: result.quality?.score ?? capture.quality,
          previewUrl,
        },
      }));

      showToast(
        `${currentStep.title} captured${capture.cropped ? " (face oval)" : ""}`,
        "success"
      );

      if (stepIndex < LIVE_ENROLLMENT_STEPS.length - 1) {
        setStepIndex((index) => index + 1);
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Capture failed",
        "error"
      );
    } finally {
      capturingRef.current = false;
      setUploading(false);
    }
  }, [
    captured,
    currentStep,
    scanner,
    showToast,
    stepIndex,
    uploadCapture,
  ]);

  captureStepRef.current = () => {
    if (!capturingRef.current && !uploading && !captured[currentStep.type]) {
      void captureCurrentStep();
    }
  };

  useEffect(() => {
    if (!open) {
      setSessionReady(false);
      return;
    }

    let active = true;
    setStepIndex(0);
    setCaptured({});

    async function start() {
      try {
        const sessionRes = await fetch(
          `/api/face-registration/employees/${employeeId}/live-session`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          }
        );
        const sessionData = await sessionRes.json();
        if (!sessionData.success) {
          throw new Error(sessionData.message || "Could not start live session");
        }

        if (active) {
          setSessionReady(true);
        }
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Unable to start session",
          "error"
        );
        onClose();
      }
    }

    void start();

    return () => {
      active = false;
    };
  }, [open, employeeId, sessionId, onClose, showToast]);

  async function handleFinish() {
    setFinishing(true);
    try {
      const res = await fetch(
        `/api/face-registration/employees/${employeeId}/live-complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        showToast(data.message || "Could not complete registration", "error");
        return;
      }

      showToast(
        data.data.embeddingsSynced
          ? "Live registration completed and embeddings generated"
          : "Poses saved but AI sync failed. Use Sync AI Embeddings on the profile.",
        data.data.embeddingsSynced ? "success" : "error"
      );
      onComplete(data.data.profile);
      onClose();
    } catch {
      showToast("Failed to finalize registration", "error");
    } finally {
      setFinishing(false);
    }
  }

  async function retakeCurrentStep() {
    const existing = captured[currentStep.type];
    if (existing?.imageId) {
      await fetch(`/api/face-registration/images/${existing.imageId}`, {
        method: "DELETE",
      });
    }

    setCaptured((prev) => {
      const next = { ...prev };
      delete next[currentStep.type];
      return next;
    });
  }

  const allCaptured = REQUIRED_FACE_TYPES.every((type) => captured[type]);
  const streamLive = scanner.streamStatus === "live";

  const statusText = captured[currentStep.type]
    ? "Step captured — move to next or retake"
    : allCaptured && stepIndex === LIVE_ENROLLMENT_STEPS.length - 1
      ? "All poses captured. Click Complete Registration."
      : scanner.statusText;

  return (
    <Modal
      open={open}
      title="Live Face Registration"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={retakeCurrentStep}
            disabled={uploading || finishing}
          >
            <RefreshCw size={16} className="mr-2" />
            Retake Step
          </Button>
          <Button
            onClick={() => void captureCurrentStep()}
            disabled={uploading || finishing || !streamLive}
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Capturing...
              </>
            ) : (
              "Capture Now"
            )}
          </Button>
          <Button
            onClick={handleFinish}
            disabled={!allCaptured || finishing || uploading}
          >
            {finishing ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Finalizing...
              </>
            ) : (
              "Complete Registration"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Step {stepIndex + 1} of {LIVE_ENROLLMENT_STEPS.length}:{" "}
              {currentStep.title}
            </p>
            <p className="text-xs text-slate-500">{statusText}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{registrationProgress}%</p>
            <p className="text-xs text-slate-500">Registration progress</p>
          </div>
        </div>

        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
            style={{ width: `${registrationProgress}%` }}
          />
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          <Monitor size={14} />
          PC Webcam · auto-scanning when your face is in the oval
        </div>

        <div className="grid grid-cols-4 gap-2">
          {LIVE_ENROLLMENT_STEPS.map((step, index) => {
            const done = Boolean(captured[step.type]);
            const active = index === stepIndex;
            const partial =
              !done && active && stepProgress > 0 && stepProgress < 100;
            return (
              <button
                key={step.type}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`relative overflow-hidden rounded-xl px-2 py-2 text-[11px] font-semibold ${
                  done
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {partial && (
                  <span
                    className="absolute inset-y-0 left-0 bg-blue-400/30"
                    style={{ width: `${stepProgress}%` }}
                  />
                )}
                <span className="relative">
                  {done ? "Done" : active ? `${stepProgress}%` : step.title}
                </span>
              </button>
            );
          })}
        </div>

        {sessionReady && (
          <WebcamFaceScanFeedView
            scanner={scanner}
            videoRef={videoRef}
            enabled={open && sessionReady}
            scannerRef={scannerRef}
            className="aspect-video min-h-[280px]"
          />
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3">
          <ScanFace size={18} className="mt-0.5 text-cyan-500" />
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-white">
              {currentStep.instruction}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Allow camera access when your browser asks. Align your face inside
              the oval — only your face is saved (auto zoom). If you are far,
              move closer until the scanner says &quot;focusing on your face&quot;.
              Scanning starts automatically at 95%+ match. Minimum quality:{" "}
              {Math.round(MIN_LIVE_QUALITY * 100)}%.
              {completedCount > 0
                ? ` ${completedCount}/${REQUIRED_FACE_TYPES.length} poses saved.`
                : ""}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
