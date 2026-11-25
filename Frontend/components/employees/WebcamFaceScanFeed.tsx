"use client";

import { useRef } from "react";
import { Loader2, ScanFace } from "lucide-react";
import PcWebcamFeed from "@/components/cameras/PcWebcamFeed";
import { useCctvFaceScanner } from "@/hooks/useCctvFaceScanner";
import type { CctvFaceScanFeedHandle } from "@/components/employees/CctvFaceScanFeed";
import type { FaceImageType } from "@/types/face-registration";
import { MIN_LIVE_QUALITY } from "@/lib/live-face-enrollment";

interface WebcamFaceScanFeedProps {
  enabled: boolean;
  poseTarget?: FaceImageType;
  className?: string;
  scannerRef?: React.MutableRefObject<CctvFaceScanFeedHandle | null>;
  scanner?: ReturnType<typeof useCctvFaceScanner>;
  autoCapture?: boolean;
  capturePaused?: boolean;
  onAutoCapture?: () => void;
  manualQuickMode?: boolean;
  ovalInstantCapture?: boolean;
}

export function WebcamFaceScanFeedView({
  scanner,
  videoRef,
  enabled,
  className,
  scannerRef,
}: {
  scanner: ReturnType<typeof useCctvFaceScanner>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  className?: string;
  scannerRef?: React.MutableRefObject<CctvFaceScanFeedHandle | null>;
}) {
  if (scannerRef) {
    scannerRef.current = {
      captureFaceBlob: scanner.captureFaceBlob,
      readyToCapture: scanner.readyToCapture,
      liveQuality: scanner.liveQuality,
      matchAccuracy: scanner.matchAccuracy,
      stepProgress: scanner.stepProgress,
      statusText: scanner.statusText,
      faceDetected: scanner.faceDetected,
      poseOk: scanner.poseOk,
    };
  }

  const streamLive = scanner.streamStatus === "live";
  const accuracy = scanner.matchAccuracy;

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black ${className}`}>
      {scanner.loadingModel && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
          <div className="text-center text-white">
            <Loader2 className="mx-auto mb-2 animate-spin" size={28} />
            <p className="text-sm">Loading face scanner...</p>
          </div>
        </div>
      )}

      <PcWebcamFeed
        enabled={enabled}
        videoRef={videoRef}
        syncToImage={false}
        hdMode
        className="absolute inset-0 h-full w-full object-contain [transform:translateZ(0)]"
        onStreamStatusChange={scanner.setStreamStatus}
        onFrameReceived={scanner.handleFrameReceived}
      />

      <canvas ref={scanner.frameCanvasRef} className="hidden" aria-hidden />

      <div
        ref={scanner.overlayRootRef}
        className="pointer-events-none absolute inset-0 z-[2]"
      >
        <canvas
          ref={scanner.ringCanvasRef}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <div className="absolute left-4 top-4 z-[3] flex flex-wrap gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${
            streamLive
              ? "bg-emerald-500/90"
              : scanner.streamStatus === "offline"
                ? "bg-rose-500/90"
                : "bg-slate-600/90"
          }`}
        >
          {streamLive
            ? "PC CAM LIVE"
            : scanner.streamStatus === "offline"
              ? "CAMERA OFF"
              : "CONNECTING"}
        </span>
        {scanner.faceDetected && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold tabular-nums text-white ${
              accuracy >= 95
                ? "bg-emerald-500/95"
                : accuracy >= 70
                  ? "bg-cyan-500/90"
                  : "bg-black/65"
            }`}
          >
            Match {accuracy}%
          </span>
        )}
        {scanner.faceDetected && accuracy < 95 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/90 px-3 py-1 text-xs font-semibold text-white">
            <ScanFace size={12} className="animate-pulse" />
            SCANNING
          </span>
        )}
        {accuracy >= 95 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-3 py-1 text-xs font-bold text-white animate-pulse">
            AUTO CAPTURE
          </span>
        )}
      </div>
    </div>
  );
}

export default function WebcamFaceScanFeed({
  scanner: externalScanner,
  poseTarget,
  enabled,
  autoCapture,
  capturePaused,
  onAutoCapture,
  manualQuickMode = false,
  ovalInstantCapture = false,
  className = "aspect-video",
  scannerRef,
}: WebcamFaceScanFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const internalScanner = useCctvFaceScanner({
    enabled: enabled && !externalScanner,
    videoRef,
    poseTarget,
    cctvMode: false,
    minQuality: manualQuickMode || ovalInstantCapture ? 0.4 : MIN_LIVE_QUALITY,
    autoCapture,
    capturePaused,
    onAutoCapture,
    manualQuickMode,
    ovalInstantCapture,
  });

  const scanner = externalScanner ?? internalScanner;

  return (
    <WebcamFaceScanFeedView
      scanner={scanner}
      videoRef={videoRef}
      enabled={enabled}
      className={className}
      scannerRef={scannerRef}
    />
  );
}

export function useWebcamFaceScanner(
  options: Omit<
    Parameters<typeof useCctvFaceScanner>[0],
    "cctvMode" | "minQuality" | "cameraId"
  > & { videoRef: React.RefObject<HTMLVideoElement | null> }
) {
  return useCctvFaceScanner({
    ...options,
    cctvMode: false,
    minQuality: MIN_LIVE_QUALITY,
  });
}
