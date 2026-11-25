"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraStreamStatus } from "@/components/cameras/CctvLiveImage";
import type { FaceImageType } from "@/types/face-registration";
import { createImperativeScanOverlay } from "@/lib/face-scan-overlay";
import {
  AUTO_CAPTURE_ACCURACY,
  AUTO_CAPTURE_STABLE_FRAMES,
  ENROLLMENT_POLL_MS,
  LIVE_DETECT_INTERVAL_MS,
  MIN_LIVE_QUALITY_CCTV,
  analyzeFrameSource,
  boxToOval,
  captureFaceFromImage,
  captureFaceFromSource,
  computeMatchAccuracy,
  detectFaceForCapture,
  estimateLiveQuality,
  getFaceDistanceHint,
  getFaceLandmarker,
  getPoseHint,
  isFaceLargeEnoughForCapture,
  isFrameSourceReady,
  mapBoxToNatural,
  poseMatchesTarget,
  prepareAnalysisCanvas,
  type DetectedFaceFrame,
  type FaceOval,
} from "@/lib/live-face-enrollment";

export interface CctvFaceScannerState {
  liveQuality: number;
  faceDetected: boolean;
  poseOk: boolean;
  stepProgress: number;
  matchAccuracy: number;
  streamStatus: CameraStreamStatus;
  loadingModel: boolean;
  statusText: string;
  readyToCapture: boolean;
  naturalBox: DetectedFaceFrame["box"] | null;
}

interface UseCctvFaceScannerOptions {
  enabled: boolean;
  cameraId?: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  poseTarget?: FaceImageType;
  cctvMode?: boolean;
  minQuality?: number;
  autoCapture?: boolean;
  autoCaptureThreshold?: number;
  capturePaused?: boolean;
  onAutoCapture?: () => void;
  onFrame?: (state: CctvFaceScannerState) => void;
  /** Manual PC capture — face in oval is enough (no strict pose), faster 100% match. */
  manualQuickMode?: boolean;
  /** Capture as soon as a face is detected in the oval — no % wait. */
  ovalInstantCapture?: boolean;
}

export function useCctvFaceScanner({
  enabled,
  cameraId,
  videoRef,
  poseTarget,
  cctvMode = true,
  minQuality = MIN_LIVE_QUALITY_CCTV,
  autoCapture = false,
  autoCaptureThreshold = AUTO_CAPTURE_ACCURACY,
  capturePaused = false,
  onAutoCapture,
  onFrame,
  manualQuickMode = false,
  ovalInstantCapture = false,
}: UseCctvFaceScannerOptions) {
  const cctvImgRef = useRef<HTMLImageElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const ringCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayEngineRef = useRef<ReturnType<typeof createImperativeScanOverlay> | null>(
    null
  );

  const landmarkerRef = useRef<Awaited<ReturnType<typeof getFaceLandmarker>> | null>(
    null
  );
  const lastDetectAtRef = useRef(0);
  const detectBusyRef = useRef(false);
  const detectScheduledRef = useRef(false);
  const stableCountRef = useRef(0);
  const targetOvalRef = useRef<FaceOval | null>(null);
  const scanPhaseRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const lastNaturalBoxRef = useRef<DetectedFaceFrame["box"] | null>(null);
  const lastFrameRef = useRef<DetectedFaceFrame | null>(null);
  const readyRef = useRef(false);
  const faceDetectedRef = useRef(false);

  const lastAutoCaptureAtRef = useRef(0);
  const onAutoCaptureRef = useRef(onAutoCapture);
  onAutoCaptureRef.current = onAutoCapture;

  const uiRef = useRef({
    liveQuality: 0,
    stepProgress: 0,
    matchAccuracy: 0,
    statusText: "Connecting camera...",
  });

  const [loadingModel, setLoadingModel] = useState(true);
  const [streamStatus, setStreamStatus] =
    useState<CameraStreamStatus>("connecting");
  const [liveQuality, setLiveQuality] = useState(0);
  const [matchAccuracy, setMatchAccuracy] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [poseOk, setPoseOk] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);
  const [statusText, setStatusText] = useState("Connecting camera...");
  const [readyToCapture, setReadyToCapture] = useState(false);

  const syncOverlaySize = useCallback(() => {
    const root = overlayRootRef.current;
    const ring = ringCanvasRef.current;
    if (!root || !ring) return;

    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;

    if (!overlayEngineRef.current) {
      overlayEngineRef.current = createImperativeScanOverlay(root, ring);
    }
    overlayEngineRef.current.setSize(w, h);
  }, []);

  const pushUi = useCallback(
    (
      quality: number,
      accuracy: number,
      detected: boolean,
      matches: boolean,
      ready: boolean,
      nextStatus: string
    ) => {
      const prev = uiRef.current;
      faceDetectedRef.current = detected;
      readyRef.current = ready;

      if (Math.abs(quality - prev.liveQuality) >= 0.02) {
        prev.liveQuality = quality;
        setLiveQuality(quality);
      }
      if (accuracy !== prev.matchAccuracy) {
        prev.matchAccuracy = accuracy;
        prev.stepProgress = accuracy;
        setMatchAccuracy(accuracy);
        setStepProgress(accuracy);
      }
      if (nextStatus !== prev.statusText) {
        prev.statusText = nextStatus;
        setStatusText(nextStatus);
      }
      setFaceDetected(detected);
      setPoseOk(matches);
      setReadyToCapture(ready);
    },
    []
  );

  const runDetectionOnce = useCallback(async () => {
    if (!enabled || detectBusyRef.current) return;

    const now = performance.now();
    if (now - lastDetectAtRef.current < LIVE_DETECT_INTERVAL_MS) {
      return;
    }

    const img = cctvImgRef.current;
    const video = videoRef?.current ?? null;
    const canvas = frameCanvasRef.current;
    if (!canvas) return;

    const frameSource =
      video && isFrameSourceReady(video)
        ? video
        : img?.complete && img.naturalWidth
          ? img
          : null;
    if (!frameSource) return;

    const prepared = prepareAnalysisCanvas(frameSource, canvas);
    if (!prepared) return;

    lastDetectAtRef.current = now;
    detectBusyRef.current = true;

    try {
      if (!landmarkerRef.current) {
        landmarkerRef.current = await getFaceLandmarker();
      }

      const frame = analyzeFrameSource(
        landmarkerRef.current,
        canvas,
        prepared.width,
        prepared.height
      );
      lastFrameRef.current = frame;

      const quality = estimateLiveQuality(frame);
      const faceInOval =
        frame.detected && isFaceLargeEnoughForCapture(frame);

      const matches =
        manualQuickMode || ovalInstantCapture
          ? faceInOval
          : poseTarget
            ? poseMatchesTarget(poseTarget, frame, { cctvMode })
            : frame.detected;

      const stableRequired =
        manualQuickMode || ovalInstantCapture ? 1 : AUTO_CAPTURE_STABLE_FRAMES;
      const captureThreshold = manualQuickMode
        ? 0
        : ovalInstantCapture
          ? 0
          : autoCaptureThreshold;

      if (matches && frame.detected && (ovalInstantCapture || quality >= minQuality)) {
        stableCountRef.current += 1;
      } else {
        stableCountRef.current = 0;
      }

      let accuracy = computeMatchAccuracy(
        frame,
        matches,
        minQuality,
        stableCountRef.current,
        stableRequired,
        manualQuickMode || ovalInstantCapture ? undefined : poseTarget,
        cctvMode
      );

      if ((manualQuickMode || ovalInstantCapture) && faceInOval) {
        accuracy = 100;
      }

      const ready =
        manualQuickMode || ovalInstantCapture
          ? faceInOval
          : frame.detected &&
            isFaceLargeEnoughForCapture(frame) &&
            matches &&
            quality >= minQuality &&
            accuracy >= captureThreshold &&
            stableCountRef.current >= stableRequired;

      if (frame.detected) {
        const naturalBox = mapBoxToNatural(frame.box, prepared.scale);
        lastNaturalBoxRef.current = naturalBox;
        targetOvalRef.current = boxToOval(naturalBox);
      } else {
        lastNaturalBoxRef.current = null;
        targetOvalRef.current = null;
      }

      overlayEngineRef.current?.setTargetOval(
        targetOvalRef.current,
        frameSource instanceof HTMLVideoElement ? frameSource : img,
        ready,
        frame.detected
      );

      const cameraLabel = cctvMode ? "CCTV camera" : "PC camera";
      let nextStatus = `Stand in front of the ${cameraLabel}`;
      const distanceHint = getFaceDistanceHint(frame);
      if (ready) {
        nextStatus =
          manualQuickMode || ovalInstantCapture
            ? "Face in oval — capturing…"
            : accuracy >= 100
              ? "Perfect match — capturing face..."
              : "Match locked — auto capturing face...";
      } else if (frame.detected && distanceHint) {
        nextStatus = distanceHint;
      } else if ((manualQuickMode || ovalInstantCapture) && frame.detected) {
        nextStatus = "Move face into the oval";
      } else if (frame.detected && accuracy >= 80) {
        nextStatus = `Almost there — hold still (${accuracy}%)`;
      } else if (frame.detected && poseTarget && !matches) {
        nextStatus =
          getPoseHint(poseTarget, frame, { cctvMode }) ||
          "Adjust your head position";
      } else if (frame.detected && quality < minQuality) {
        nextStatus = "Move closer — focusing on your face";
      } else if (frame.detected) {
        nextStatus = "Hold still inside the oval";
      }

      pushUi(quality, accuracy, frame.detected, matches, ready, nextStatus);

      onFrame?.({
        liveQuality: quality,
        faceDetected: frame.detected,
        poseOk: matches,
        stepProgress: accuracy,
        matchAccuracy: accuracy,
        streamStatus,
        loadingModel,
        statusText: nextStatus,
        readyToCapture: ready,
        naturalBox: lastNaturalBoxRef.current,
      });

      if (
        autoCapture &&
        !capturePaused &&
        ready &&
        Date.now() - lastAutoCaptureAtRef.current >
          (manualQuickMode || ovalInstantCapture ? 450 : 1500)
      ) {
        lastAutoCaptureAtRef.current = Date.now();
        stableCountRef.current = 0;
        onAutoCaptureRef.current?.();
      }
    } catch {
      pushUi(
        uiRef.current.liveQuality,
        uiRef.current.matchAccuracy,
        false,
        false,
        false,
        "Face detection running..."
      );
    } finally {
      detectBusyRef.current = false;
    }
  }, [
    autoCapture,
    autoCaptureThreshold,
    capturePaused,
    cctvMode,
    enabled,
    loadingModel,
    manualQuickMode,
    minQuality,
    onFrame,
    ovalInstantCapture,
    poseTarget,
    pushUi,
    streamStatus,
    videoRef,
  ]);

  const handleFrameReceived = useCallback(() => {
    if (detectScheduledRef.current) return;
    detectScheduledRef.current = true;
    requestAnimationFrame(() => {
      detectScheduledRef.current = false;
      void runDetectionOnce();
    });
  }, [runDetectionOnce]);

  const captureFaceBlob = useCallback(async () => {
    const video = videoRef?.current;
    const canvas = frameCanvasRef.current;

    if (video && isFrameSourceReady(video)) {
      if (!landmarkerRef.current) {
        landmarkerRef.current = await getFaceLandmarker();
      }

      const detected = await detectFaceForCapture(
        video,
        landmarkerRef.current,
        canvas ?? undefined
      );
      if (!detected) {
        return { blob: null as Blob | null, cropped: false, quality: 0 };
      }

      const quality = Math.max(
        estimateLiveQuality(detected.frame),
        uiRef.current.liveQuality
      );
      const result = await captureFaceFromSource(video, detected.naturalBox);
      return { ...result, quality };
    }

    let img: HTMLImageElement | null = cctvImgRef.current;

    if (cameraId) {
      try {
        const response = await fetch(
          `/api/cameras/${cameraId}/live?mode=snapshot&preview=0&_t=${Date.now()}`,
          { cache: "no-store", credentials: "include" }
        );
        if (response.ok && response.headers.get("content-type")?.includes("image")) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const fullImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("full frame load failed"));
            el.src = objectUrl;
          });
          URL.revokeObjectURL(objectUrl);

          if (landmarkerRef.current && fullImg.naturalWidth > 0) {
            const canvas = frameCanvasRef.current ?? document.createElement("canvas");
            const prepared = prepareAnalysisCanvas(fullImg, canvas);
            if (prepared) {
              const frame = analyzeFrameSource(
                landmarkerRef.current,
                canvas,
                prepared.width,
                prepared.height
              );
              if (frame.detected) {
                lastNaturalBoxRef.current = mapBoxToNatural(
                  frame.box,
                  prepared.scale
                );
              }
            }
          }
          img = fullImg;
        }
      } catch {
        // use live preview frame
      }
    }

    if (!img || !img.complete || !img.naturalWidth) {
      return { blob: null as Blob | null, cropped: false, quality: 0 };
    }

    if (!landmarkerRef.current) {
      landmarkerRef.current = await getFaceLandmarker();
    }

    const detected = await detectFaceForCapture(
      img,
      landmarkerRef.current,
      canvas ?? undefined
    );
    if (!detected) {
      return { blob: null as Blob | null, cropped: false, quality: 0 };
    }

    const quality = Math.max(
      estimateLiveQuality(detected.frame),
      uiRef.current.liveQuality
    );

    const result = await captureFaceFromImage(img, detected.naturalBox);
    return { ...result, quality };
  }, [cameraId, videoRef]);

  useEffect(() => {
    if (!enabled) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      overlayEngineRef.current?.clear();
      return;
    }

    syncOverlaySize();

    const tick = () => {
      scanPhaseRef.current = (scanPhaseRef.current + 0.018) % 1;
      overlayEngineRef.current?.tick(scanPhaseRef.current);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && overlayRootRef.current
        ? new ResizeObserver(() => syncOverlaySize())
        : null;
    if (resizeObserver && overlayRootRef.current) {
      resizeObserver.observe(overlayRootRef.current);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      resizeObserver?.disconnect();
    };
  }, [enabled, syncOverlaySize]);

  useEffect(() => {
    if (!enabled) {
      setLoadingModel(false);
      return;
    }

    let active = true;
    setLoadingModel(true);
    stableCountRef.current = 0;
    targetOvalRef.current = null;
    lastNaturalBoxRef.current = null;
    lastFrameRef.current = null;
    uiRef.current = {
      liveQuality: 0,
      stepProgress: 0,
      matchAccuracy: 0,
      statusText: "Connecting camera...",
    };
    setStreamStatus("connecting");
    setStepProgress(0);
    setMatchAccuracy(0);
    setLiveQuality(0);
    lastAutoCaptureAtRef.current = 0;
    setFaceDetected(false);

    void getFaceLandmarker().then((lm) => {
      if (!active) return;
      landmarkerRef.current = lm;
      setLoadingModel(false);
      setStatusText(
        cctvMode ? "Stand in front of the CCTV camera" : "Allow PC camera access when prompted"
      );
    });

    return () => {
      active = false;
      overlayEngineRef.current?.destroy();
      overlayEngineRef.current = null;
    };
  }, [cctvMode, enabled]);

  useEffect(() => {
    stableCountRef.current = 0;
    lastAutoCaptureAtRef.current = 0;
  }, [poseTarget]);

  return {
    cctvImgRef,
    frameCanvasRef,
    overlayRootRef,
    ringCanvasRef,
    streamStatus,
    setStreamStatus,
    loadingModel,
    liveQuality,
    faceDetected,
    poseOk,
    matchAccuracy,
    stepProgress,
    statusText,
    readyToCapture,
    handleFrameReceived,
    captureFaceBlob,
    pollIntervalMs: ENROLLMENT_POLL_MS,
  };
}
