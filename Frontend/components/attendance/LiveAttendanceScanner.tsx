"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ScanFace } from "lucide-react";
import { useToast } from "@/providers/ToastProvider";
import {
  analyzeFrameSource,
  captureFaceFromSource,
  DETECT_MAX_WIDTH,
  DETECT_MAX_WIDTH_CCTV,
  getFaceLandmarker,
  isFrameSourceReady,
  mapBoxToNatural,
  mapFaceBoxToOverlay,
  prepareAnalysisCanvas,
  toSquareFaceBox,
  type DetectedFaceFrame,
  type FrameSource,
} from "@/lib/live-face-enrollment";
import { detectMotionFromSource } from "@/utils/motion-detection";

export type LiveScanPhase =
  | "idle"
  | "watching"
  | "scanning"
  | "face_found"
  | "recognized";

export interface LiveScanDetail {
  employeeName?: string;
  confidence?: number;
  matched?: boolean;
}

export interface LiveMarkResult {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  department?: string | null;
  action: "CHECK_IN" | "CHECK_OUT" | "PRESENT";
  late_minutes: number;
  event_time: string;
  confidence: number;
  attendance_status?: string;
  check_in?: string | null;
  check_out?: string | null;
}

export interface GateScanReport {
  at: string;
  cameraId: number;
  phase: LiveScanPhase;
  employee_id?: number;
  employee_name?: string;
  employee_code?: string;
  confidence?: number;
  action?: LiveMarkResult["action"];
  late_minutes?: number;
  attendance_status?: string;
  message: string;
  marked: boolean;
}

interface LiveAttendanceScannerProps {
  cameraId?: number | null;
  locationId?: number | null;
  enabled?: boolean;
  imageRef: React.RefObject<HTMLImageElement | null>;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  liteMode?: boolean;
  scanIntervalMs?: number;
  minMatchConfidence?: number;
  cameraLabel?: string;
  onMarked?: (result: LiveMarkResult) => void;
  onScanPhaseChange?: (phase: LiveScanPhase, detail?: LiveScanDetail) => void;
  onReport?: (report: GateScanReport) => void;
  onMatchActivity?: () => void;
  showBadge?: boolean;
  webcamMode?: boolean;
  webcamContext?: {
    branch_name?: string;
    entrance?: string;
    entry_exit_type?: string;
    display_name?: string;
  };
}

export interface LiveAttendanceScannerHandle {
  onNewFrame: () => void;
}

const GATE_SCAN_MS = 2500;
const FACE_DETECT_MS = 380;
const MATCH_FRAME_COOLDOWN_MS = 1100;
/** PC webcam — scan faces ~10×/sec for instant pickup */
const WEBCAM_FACE_DETECT_MS = 90;
const WEBCAM_MATCH_COOLDOWN_MS = 350;
const WEBCAM_MATCH_JPEG_QUALITY = 0.82;
const MARKED_EMPLOYEE_COOLDOWN_MS = 30_000;
const FACE_MISS_CLEAR = 4;
const MOTION_HOLD_MS = 4000;
const RECOGNIZED_HIGHLIGHT_MS = 6500;

type BoxTone = "idle" | "scan" | "match" | "unknown" | "marked";

interface FaceBoxState {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  tone: BoxTone;
  confidence?: number;
}

function formatReportTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function actionLabel(action?: string) {
  if (action === "CHECK_IN") return "Check-in";
  if (action === "CHECK_OUT") return "Check-out";
  return "Present";
}

function toGateReport(
  cameraId: number,
  data: {
    at: string;
    face_detected: boolean;
    matched: boolean;
    marked: boolean;
    skipped?: boolean;
    employee_id?: number;
    employee_name?: string;
    employee_code?: string;
    department?: string | null;
    confidence?: number;
    action?: LiveMarkResult["action"];
    late_minutes?: number;
    attendance_status?: string;
    event_time?: string;
    message: string;
  }
): GateScanReport {
  let phase: LiveScanPhase = "watching";
  if (data.marked) phase = "recognized";
  else if (data.matched) phase = "recognized";
  else if (data.face_detected) phase = "face_found";

  return {
    at: data.at,
    cameraId,
    phase,
    employee_id: data.employee_id,
    employee_name: data.employee_name,
    employee_code: data.employee_code,
    confidence: data.confidence,
    action: data.action,
    late_minutes: data.late_minutes,
    attendance_status: data.attendance_status,
    message: data.message,
    marked: data.marked,
  };
}

function boxToneClass(tone: BoxTone) {
  switch (tone) {
    case "scan":
      return "border-2 border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.5)]";
    case "match":
      return "border-[3px] border-emerald-400 bg-emerald-500/20 shadow-[0_0_28px_rgba(52,211,153,0.7)]";
    case "marked":
      return "border-[3px] border-emerald-300 bg-emerald-400/25 shadow-[0_0_32px_rgba(74,222,128,0.85)]";
    case "unknown":
      return "border-2 border-orange-400 bg-orange-500/10 shadow-[0_0_18px_rgba(251,146,60,0.4)]";
    default:
      return "border-2 border-cyan-400 bg-cyan-500/5 shadow-[0_0_16px_rgba(34,211,238,0.4)]";
  }
}

function cornerToneClass(tone: BoxTone) {
  switch (tone) {
    case "match":
    case "marked":
      return "text-emerald-400";
    case "scan":
      return "text-amber-400";
    case "unknown":
      return "text-orange-400";
    default:
      return "text-cyan-300";
  }
}

function labelToneClass(tone: BoxTone) {
  switch (tone) {
    case "scan":
      return "bg-amber-500/95 text-white";
    case "match":
    case "marked":
      return "bg-emerald-500/95 text-white";
    case "unknown":
      return "bg-orange-500/95 text-white";
    default:
      return "bg-cyan-500/95 text-white";
  }
}

const LiveAttendanceScanner = forwardRef<
  LiveAttendanceScannerHandle,
  LiveAttendanceScannerProps
>(function LiveAttendanceScanner(
  {
    cameraId = null,
    locationId,
    imageRef,
    videoRef,
    enabled = true,
    liteMode = false,
    scanIntervalMs = GATE_SCAN_MS,
    minMatchConfidence = 0.65,
    cameraLabel = "PC Webcam",
    onMarked,
    onScanPhaseChange,
    onReport,
    onMatchActivity,
    showBadge = false,
    webcamMode = false,
    webcamContext,
  },
  ref
) {
  const { showToast } = useToast();
  const reportCameraId = cameraId && cameraId > 0 ? cameraId : 0;
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scanPhase, setScanPhase] = useState<LiveScanPhase>("watching");
  const [liveRecognition, setLiveRecognition] = useState<LiveMarkResult | null>(
    null
  );
  const [faceBox, setFaceBox] = useState<FaceBoxState | null>(null);
  const [motionSensitivity, setMotionSensitivity] = useState(25);

  const faceBoxRef = useRef<FaceBoxState | null>(null);
  const lastNaturalBoxRef = useRef<DetectedFaceFrame["box"] | null>(null);
  const lastSeenAtRef = useRef<string>("");
  const lastDetectAtRef = useRef(0);
  const lastMatchAtRef = useRef(0);
  const faceMissRef = useRef(0);
  const scanInflightRef = useRef(false);
  const matchInflightRef = useRef(false);
  const scanPhaseRef = useRef<LiveScanPhase>("watching");
  const detectBusyRef = useRef(false);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof getFaceLandmarker>> | null>(
    null
  );
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevMotionFrameRef = useRef<ImageData | null>(null);
  const motionActiveUntilRef = useRef(0);
  const motionIdleMissRef = useRef(0);
  const markedEmployeesRef = useRef<Map<number, number>>(new Map());
  const lastIdentifiedEmployeeRef = useRef<number | null>(null);
  const recognizedHoldUntilRef = useRef(0);
  const hadFaceRef = useRef(false);

  const faceDetectIntervalMs = webcamMode ? WEBCAM_FACE_DETECT_MS : FACE_DETECT_MS;
  const matchCooldownMs = webcamMode ? WEBCAM_MATCH_COOLDOWN_MS : MATCH_FRAME_COOLDOWN_MS;

  const holdRecognitionHighlight = useCallback(() => {
    recognizedHoldUntilRef.current = Date.now() + RECOGNIZED_HIGHLIGHT_MS;
  }, []);

  const isRecognitionHighlightActive = useCallback(() => {
    return Date.now() < recognizedHoldUntilRef.current;
  }, []);

  const getFrameSource = useCallback((): FrameSource | null => {
    const video = videoRef?.current;
    if (video && isFrameSourceReady(video)) return video;
    const img = imageRef.current;
    if (img && isFrameSourceReady(img)) return img;
    return null;
  }, [imageRef, videoRef]);

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/ai/recognition-settings")
      .then((res) => res.json())
      .then((payload) => {
        const settings = payload.data?.settings;
        if (payload.success && settings) {
          if (settings.motionSensitivity != null) {
            setMotionSensitivity(Number(settings.motionSensitivity));
          }
        }
      })
      .catch(() => undefined);
  }, [enabled]);

  const showLiveRecognition = useCallback((result: LiveMarkResult) => {
    setLiveRecognition(result);
    window.setTimeout(() => setLiveRecognition(null), RECOGNIZED_HIGHLIGHT_MS);
  }, []);

  useEffect(() => {
    faceBoxRef.current = faceBox;
  }, [faceBox]);

  const updatePhase = useCallback(
    (phase: LiveScanPhase, detail?: LiveScanDetail) => {
      scanPhaseRef.current = phase;
      setScanPhase(phase);
      onScanPhaseChange?.(phase, detail);
    },
    [onScanPhaseChange]
  );

  const applyAttendanceResult = useCallback(
    (
      data: {
        employee_id: number;
        employee_name: string;
        employee_code?: string;
        department?: string | null;
        confidence: number;
        action?: LiveMarkResult["action"];
        late_minutes?: number;
        event_time: string;
        attendance_status?: string;
      },
      reportMessage: string,
      marked: boolean
    ) => {
      const result: LiveMarkResult = {
        employee_id: data.employee_id,
        employee_name: data.employee_name,
        employee_code: data.employee_code || "",
        department: data.department || null,
        confidence: data.confidence,
        action: data.action || "PRESENT",
        late_minutes: data.late_minutes || 0,
        event_time: data.event_time,
        attendance_status: data.attendance_status,
      };

      if (marked) {
        onMarked?.(result);
        const when = formatReportTime(result.event_time);
        const lateText =
          result.late_minutes > 0 ? ` · Late ${result.late_minutes} min` : "";
        showToast(
          `${actionLabel(result.action)}: ${result.employee_name} · ${Math.round(result.confidence * 100)}% · ${when}${lateText}`,
          result.action === "CHECK_IN" ? "success" : "info"
        );
      }

      setFaceBox((prev) => {
        const tone = marked ? "marked" : "match";
        const label = marked
          ? `✓ ${actionLabel(result.action)} · ${result.employee_name}`
          : `RECOGNIZED · ${result.employee_name}`;
        if (!prev) return prev;
        return {
          ...prev,
          tone,
          label,
          confidence: result.confidence,
        };
      });

      holdRecognitionHighlight();
      showLiveRecognition(result);

      updatePhase("recognized", {
        employeeName: result.employee_name,
        confidence: result.confidence,
        matched: true,
      });

      onReport?.({
        at: result.event_time,
        cameraId: reportCameraId,
        phase: "recognized",
        employee_id: result.employee_id,
        employee_name: result.employee_name,
        employee_code: result.employee_code,
        confidence: result.confidence,
        action: result.action,
        late_minutes: result.late_minutes,
        attendance_status: result.attendance_status,
        message: reportMessage,
        marked,
      });

      window.setTimeout(() => {
        if (Date.now() >= recognizedHoldUntilRef.current) {
          updatePhase(faceBoxRef.current ? "face_found" : "watching");
        }
      }, RECOGNIZED_HIGHLIGHT_MS);
    },
    [
      cameraId,
      holdRecognitionHighlight,
      onMarked,
      onReport,
      showLiveRecognition,
      showToast,
      updatePhase,
    ]
  );

  const handleScanResult = useCallback(
    (data: {
      at: string;
      face_detected: boolean;
      matched: boolean;
      marked: boolean;
      skipped?: boolean;
      employee_id?: number;
      employee_name?: string;
      employee_code?: string;
      department?: string | null;
      confidence?: number;
      action?: LiveMarkResult["action"];
      late_minutes?: number;
      attendance_status?: string;
      event_time?: string;
      message: string;
    }) => {
      const confidence = Number(data.confidence ?? 0);

      if (!data.face_detected && !data.matched && !data.marked) {
        updatePhase(faceBoxRef.current ? "face_found" : "watching");
        return;
      }

      if (data.matched && data.skipped && !data.marked && data.employee_id) {
        holdRecognitionHighlight();
        setFaceBox((prev) =>
          prev
            ? {
                ...prev,
                tone: "match",
                label: `RECOGNIZED · ${data.employee_name || "Employee"}`,
                confidence,
              }
            : prev
        );
        if (data.employee_name) {
          showLiveRecognition({
            employee_id: data.employee_id,
            employee_name: data.employee_name,
            employee_code: data.employee_code || "",
            department: data.department || null,
            confidence,
            action: data.action || "PRESENT",
            late_minutes: data.late_minutes || 0,
            event_time: data.event_time || data.at,
            attendance_status: data.attendance_status,
          });
        }
        updatePhase("recognized", {
          matched: true,
          employeeName: data.employee_name,
          confidence,
        });
        return;
      }

      if (!data.matched) {
        onReport?.(toGateReport(reportCameraId, data));
        setFaceBox((prev) =>
          prev
            ? { ...prev, tone: "unknown", label: "Unknown face", confidence }
            : prev
        );
        updatePhase("face_found");
        return;
      }

      if (
        data.employee_id &&
        data.employee_name &&
        confidence >= minMatchConfidence &&
        data.marked
      ) {
        applyAttendanceResult(
          {
            employee_id: data.employee_id,
            employee_name: data.employee_name,
            employee_code: data.employee_code,
            department: data.department,
            confidence,
            action: data.action,
            late_minutes: data.late_minutes,
            event_time: data.event_time || data.at,
            attendance_status: data.attendance_status,
          },
          data.message,
          true
        );
      }
    },
    [
      applyAttendanceResult,
      cameraId,
      holdRecognitionHighlight,
      minMatchConfidence,
      onReport,
      showLiveRecognition,
      updatePhase,
    ]
  );

  const matchLiveFace = useCallback(async () => {
    if (!enabled || matchInflightRef.current || !lastNaturalBoxRef.current) return;
    const source = getFrameSource();
    if (!source) return;

    const now = Date.now();
    const lastEmployeeId = lastIdentifiedEmployeeRef.current;
    if (lastEmployeeId) {
      const markedAt = markedEmployeesRef.current.get(lastEmployeeId);
      if (markedAt && now - markedAt < MARKED_EMPLOYEE_COOLDOWN_MS) {
        return;
      }
    }

    if (now - lastMatchAtRef.current < matchCooldownMs) return;

    matchInflightRef.current = true;
    lastMatchAtRef.current = now;
    onMatchActivity?.();
    setFaceBox((prev) =>
      prev ? { ...prev, tone: "scan", label: "Scanning…" } : prev
    );
    updatePhase("scanning");

    try {
      const buildForm = (imageBlob: Blob) => {
        const form = new FormData();
        form.append("image", imageBlob, "face.jpg");
        if (webcamMode) {
          form.append("source", "webcam");
          if (cameraId && cameraId > 0) {
            form.append("camera_id", String(cameraId));
          }
          if (webcamContext?.branch_name) {
            form.append("branch_name", webcamContext.branch_name);
          }
          if (webcamContext?.entrance) {
            form.append("entrance", webcamContext.entrance);
          }
          if (webcamContext?.entry_exit_type) {
            form.append("entry_exit_type", webcamContext.entry_exit_type);
          }
          if (webcamContext?.display_name) {
            form.append("display_name", webcamContext.display_name);
          }
        } else if (cameraId && cameraId > 0) {
          form.append("camera_id", String(cameraId));
        }
        if (locationId != null) form.append("location_id", String(locationId));
        return form;
      };

      const postMatch = async (imageBlob: Blob) => {
        const response = await fetch("/api/ai/match-frame", {
          method: "POST",
          body: buildForm(imageBlob),
        });
        return response.json();
      };

      const { blob, cropped } = await captureFaceFromSource(
        source,
        lastNaturalBoxRef.current,
        webcamMode ? { jpegQuality: WEBCAM_MATCH_JPEG_QUALITY } : undefined
      );
      if (!blob) return;

      let payload = await postMatch(blob);

      if (
        !webcamMode &&
        !payload.matched &&
        cropped &&
        payload.face_detected === false
      ) {
        const { blob: fullBlob } = await captureFaceFromSource(source, null);
        if (fullBlob) {
          payload = await postMatch(fullBlob);
        }
      }

      const at = new Date().toISOString();

      if (!payload.matched || !payload.data?.employee_id) {
        const hint =
          payload.face_detected === false
            ? "AI could not read face — move closer"
            : payload.message || "Face not registered";
        onReport?.(
          toGateReport(reportCameraId, {
            at,
            face_detected: true,
            matched: false,
            marked: false,
            confidence: payload.confidence ?? undefined,
            message: hint,
          })
        );
        setFaceBox((prev) =>
          prev
            ? {
                ...prev,
                tone: "unknown",
                label: hint,
                confidence: payload.confidence ?? undefined,
              }
            : prev
        );
        updatePhase("face_found");
        return;
      }

      const row = payload.data;
      const confidence = Number(row.confidence ?? payload.confidence ?? 0);
      const marked = Boolean(
        payload.marked === true ||
          (payload.matched && !payload.skipped && payload.data)
      );

      if (row.employee_id) {
        lastIdentifiedEmployeeRef.current = row.employee_id;
      }

      if (payload.skipped) {
        const skipReason = String(payload.skip_reason || "");
        const movementOnly = skipReason === "movement_only" || payload.movement_logged;
        const alreadyDone =
          skipReason === "recent_duplicate" ||
          movementOnly ||
          payload.message?.toLowerCase().includes("already marked");

        if (row.employee_id && alreadyDone && skipReason === "recent_duplicate") {
          markedEmployeesRef.current.set(row.employee_id, Date.now());
        }

        const previewResult: LiveMarkResult = {
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          employee_code: row.employee_code || "",
          department: row.department || null,
          confidence,
          action: row.action || "PRESENT",
          late_minutes: row.late_minutes || 0,
          event_time: row.event_time || at,
          attendance_status: row.attendance_status,
        };

        showLiveRecognition(previewResult);
        holdRecognitionHighlight();

        const skipMessage =
          skipReason === "movement_only"
            ? `${row.employee_name} · already checked in today`
            : skipReason === "no_face_registered"
              ? `${row.employee_name} · face not registered`
              : skipReason === "check_in_failed"
                ? "Check-in failed — contact admin"
                : skipReason === "before_shift"
                  ? "Outside working hours"
                  : skipReason === "recent_duplicate"
                    ? `${row.employee_name} · already scanned`
                    : payload.message || `${row.employee_name} · recognized`;

        if (skipReason === "check_in_failed" || skipReason === "no_face_registered") {
          showToast(
            skipReason === "no_face_registered"
              ? `${row.employee_name} has no registered face. Use Face Registration or manual check-in.`
              : skipMessage,
            "error"
          );
        }

        setFaceBox((prev) =>
          prev
            ? {
                ...prev,
                tone: movementOnly ? "marked" : "match",
                label: `RECOGNIZED · ${row.employee_name}`,
                confidence,
              }
            : prev
        );
        updatePhase("recognized", {
          employeeName: row.employee_name,
          confidence,
          matched: true,
        });
        return;
      }

      if (marked) {
        if (row.employee_id) {
          markedEmployeesRef.current.set(row.employee_id, Date.now());
        }
        applyAttendanceResult(
          {
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            employee_code: row.employee_code,
            department: row.department,
            confidence,
            action: row.action,
            late_minutes: row.late_minutes,
            event_time: row.event_time || at,
            attendance_status: row.attendance_status,
          },
          `${actionLabel(row.action)} · ${row.attendance_status || "Marked"} · ${row.employee_name}`,
          true
        );
      } else {
        holdRecognitionHighlight();
        showLiveRecognition({
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          employee_code: row.employee_code || "",
          department: row.department || null,
          confidence,
          action: row.action || "PRESENT",
          late_minutes: row.late_minutes || 0,
          event_time: row.event_time || at,
          attendance_status: row.attendance_status,
        });
        setFaceBox((prev) =>
          prev
            ? {
                ...prev,
                tone: "match",
                label: `RECOGNIZED · ${row.employee_name}`,
                confidence,
              }
            : prev
        );
        updatePhase("recognized", {
          employeeName: row.employee_name,
          confidence,
          matched: true,
        });
      }
    } catch {
      setFaceBox((prev) =>
        prev ? { ...prev, tone: "idle", label: "Scan retry…" } : prev
      );
      updatePhase("face_found");
    } finally {
      matchInflightRef.current = false;
      if (scanPhaseRef.current === "scanning") {
        updatePhase(faceBoxRef.current ? "face_found" : "watching");
      }
    }
  }, [
    applyAttendanceResult,
    cameraId,
    enabled,
    getFrameSource,
    holdRecognitionHighlight,
    locationId,
    matchCooldownMs,
    minMatchConfidence,
    onMatchActivity,
    onReport,
    showLiveRecognition,
    updatePhase,
    webcamContext,
    webcamMode,
  ]);

  const pollRecentScans = useCallback(async () => {
    if (!enabled || faceBoxRef.current || webcamMode || !cameraId || cameraId <= 0) return;
    try {
      const response = await fetch(
        `/api/ai/gate-scan?camera_id=${cameraId}&limit=3`
      );
      const payload = await response.json();
      const latest = payload.data?.[0];
      if (!latest?.at || latest.at === lastSeenAtRef.current) return;
      if (!latest.face_detected && !latest.matched && !latest.marked) return;

      lastSeenAtRef.current = latest.at;
      handleScanResult(latest);
    } catch {
      // ignore
    }
  }, [cameraId, enabled, handleScanResult, webcamMode]);

  const triggerGateScan = useCallback(async () => {
    if (
      !enabled ||
      scanInflightRef.current ||
      matchInflightRef.current ||
      webcamMode ||
      !cameraId ||
      cameraId <= 0
    )
      return;
    if (faceBoxRef.current) return;

    scanInflightRef.current = true;
    updatePhase("scanning");
    try {
      const response = await fetch("/api/ai/gate-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_id: cameraId }),
      });
      const payload = await response.json();
      const data = payload.data;
      if (!data?.at) return;
      if (data.at === lastSeenAtRef.current) return;
      lastSeenAtRef.current = data.at;
      handleScanResult(data);
    } catch {
      // ignore
    } finally {
      scanInflightRef.current = false;
      if (scanPhaseRef.current === "scanning") {
        updatePhase("watching");
      }
    }
  }, [cameraId, enabled, handleScanResult, updatePhase, webcamMode]);

  const detectAndScanFace = useCallback(async () => {
    if (!enabled || detectBusyRef.current) return;
    const now = Date.now();
    if (now - lastDetectAtRef.current < faceDetectIntervalMs) return;

    const source = getFrameSource();
    if (!source) return;

    detectBusyRef.current = true;
    lastDetectAtRef.current = now;
    try {
      if (!landmarkerRef.current) {
        landmarkerRef.current = await getFaceLandmarker();
      }
      const canvas =
        analysisCanvasRef.current ?? document.createElement("canvas");
      analysisCanvasRef.current = canvas;
      const detectMaxWidth = webcamMode
        ? DETECT_MAX_WIDTH
        : liteMode
          ? DETECT_MAX_WIDTH_CCTV
          : undefined;
      const prepared = prepareAnalysisCanvas(source, canvas, {
        maxWidth: detectMaxWidth,
      });
      if (!prepared) return;

      const frame = analyzeFrameSource(
        landmarkerRef.current,
        canvas,
        prepared.width,
        prepared.height
      );

      const minConfidence = webcamMode ? 0.02 : liteMode ? 0.03 : 0.08;
      const minSizeRatio = webcamMode ? 0.0008 : liteMode ? 0.0015 : 0.008;
      const minBox = webcamMode ? 6 : liteMode ? 8 : 20;

      const isHumanFace =
        frame.detected &&
        frame.confidence >= minConfidence &&
        frame.faceSizeRatio >= minSizeRatio &&
        frame.box.width >= minBox &&
        frame.box.height >= minBox;

      if (!isHumanFace) {
        hadFaceRef.current = false;
        faceMissRef.current += 1;
        if (
          faceMissRef.current >= FACE_MISS_CLEAR &&
          !isRecognitionHighlightActive()
        ) {
          setFaceBox(null);
          lastNaturalBoxRef.current = null;
          lastIdentifiedEmployeeRef.current = null;
          if (!matchInflightRef.current && !scanInflightRef.current) {
            updatePhase("watching");
          }
        }
        return;
      }

      const faceJustAppeared = !hadFaceRef.current;
      hadFaceRef.current = true;
      faceMissRef.current = 0;
      const square = toSquareFaceBox(frame.box, liteMode ? 1.2 : 1.12);
      lastNaturalBoxRef.current = mapBoxToNatural(square, prepared.scale);

      const root = overlayRef.current;
      const { width: sourceWidth, height: sourceHeight } =
        source instanceof HTMLVideoElement
          ? { width: source.videoWidth, height: source.videoHeight }
          : { width: source.naturalWidth, height: source.naturalHeight };
      const overlayWidth = root?.clientWidth || sourceWidth;
      const overlayHeight = root?.clientHeight || sourceHeight;

      if (overlayWidth > 4 && overlayHeight > 4) {
        const box = mapFaceBoxToOverlay(
          square,
          source,
          prepared.scale,
          overlayWidth,
          overlayHeight
        );
        setFaceBox((prev) => {
          const base = {
            x: Math.max(0, box.x),
            y: Math.max(0, box.y),
            width: Math.max(1, box.width),
            height: Math.max(1, box.height),
          };
          if (
            isRecognitionHighlightActive() &&
            prev &&
            (prev.tone === "match" || prev.tone === "marked")
          ) {
            return {
              ...base,
              tone: prev.tone,
              label: prev.label,
              confidence: prev.confidence,
            };
          }
          return {
            ...base,
            label: "",
            tone: matchInflightRef.current ? "scan" : "idle",
          };
        });
      }

      if (!isRecognitionHighlightActive()) {
        updatePhase("face_found");
      }

      const canMatch =
        !matchInflightRef.current &&
        (faceJustAppeared || now - lastMatchAtRef.current >= matchCooldownMs);
      if (canMatch) {
        if (faceJustAppeared) {
          lastMatchAtRef.current = 0;
        }
        void matchLiveFace();
      }
    } catch {
      // keep last box
    } finally {
      detectBusyRef.current = false;
    }
  }, [
    enabled,
    faceDetectIntervalMs,
    getFrameSource,
    isRecognitionHighlightActive,
    liteMode,
    matchCooldownMs,
    matchLiveFace,
    updatePhase,
    webcamMode,
  ]);

  useImperativeHandle(ref, () => ({
    onNewFrame: () => {
      const source = getFrameSource();
      if (!source) return;

      const canvas =
        motionCanvasRef.current ?? document.createElement("canvas");
      motionCanvasRef.current = canvas;
      const { motion, frame } = detectMotionFromSource(
        source,
        canvas,
        prevMotionFrameRef.current,
        motionSensitivity
      );
      prevMotionFrameRef.current = frame;

      const now = Date.now();
      if (motion) {
        motionActiveUntilRef.current = now + MOTION_HOLD_MS;
        motionIdleMissRef.current = 0;
      }

      // PC webcam: face scan runs on dedicated rAF loop (faster than frame sync).
      if (webcamMode) {
        return;
      }

      if (now >= motionActiveUntilRef.current) {
        motionIdleMissRef.current += 1;
        if (motionIdleMissRef.current >= FACE_MISS_CLEAR) {
          setFaceBox(null);
          lastNaturalBoxRef.current = null;
          lastIdentifiedEmployeeRef.current = null;
          if (
            !matchInflightRef.current &&
            !scanInflightRef.current &&
            scanPhaseRef.current !== "scanning"
          ) {
            updatePhase("watching");
          }
        }
        return;
      }

      void detectAndScanFace();
    },
  }));

  useEffect(() => {
    if (!enabled || !webcamMode) return;

    let raf = 0;
    const tick = () => {
      void detectAndScanFace();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [detectAndScanFace, enabled, webcamMode]);

  useEffect(() => {
    if (!enabled) {
      updatePhase("idle");
      setFaceBox(null);
      motionActiveUntilRef.current = 0;
      prevMotionFrameRef.current = null;
      return;
    }

    updatePhase("watching");
    void getFaceLandmarker().then((lm) => {
      landmarkerRef.current = lm;
    });

    if (!cameraId || cameraId <= 0) {
      return;
    }

    const pollTimer = window.setInterval(
      () => void pollRecentScans(),
      scanIntervalMs
    );
    const kickoff = window.setTimeout(() => void pollRecentScans(), 500);

    return () => {
      window.clearInterval(pollTimer);
      window.clearTimeout(kickoff);
    };
  }, [
    cameraId,
    enabled,
    scanIntervalMs,
    pollRecentScans,
    updatePhase,
    detectAndScanFace,
  ]);

  if (!enabled) return null;

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10">
      {faceBox && (
        <div
          className="absolute"
          style={{
            left: `${faceBox.x}px`,
            top: `${faceBox.y}px`,
            width: `${faceBox.width}px`,
            height: `${faceBox.height}px`,
          }}
        >
          <div
            className={`absolute inset-0 rounded-sm ${boxToneClass(faceBox.tone)} ${
              faceBox.tone === "scan" ||
              faceBox.tone === "match" ||
              faceBox.tone === "marked"
                ? "animate-pulse"
                : ""
            }`}
          />
          {(faceBox.label || (faceBox.confidence != null && faceBox.confidence > 0)) && (
            <span
              className={`absolute -top-7 left-0 max-w-[240px] truncate rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide shadow-lg ${labelToneClass(faceBox.tone)}`}
            >
              {faceBox.label}
              {faceBox.confidence != null && faceBox.confidence > 0
                ? `${faceBox.label ? " · " : ""}${Math.round(faceBox.confidence * 100)}%`
                : ""}
            </span>
          )}
          <span className={`absolute -left-px -top-px h-4 w-4 border-l-[3px] border-t-[3px] border-current ${cornerToneClass(faceBox.tone)}`} />
          <span className={`absolute -right-px -top-px h-4 w-4 border-r-[3px] border-t-[3px] border-current ${cornerToneClass(faceBox.tone)}`} />
          <span className={`absolute -bottom-px -left-px h-4 w-4 border-b-[3px] border-l-[3px] border-current ${cornerToneClass(faceBox.tone)}`} />
          <span className={`absolute -bottom-px -right-px h-4 w-4 border-b-[3px] border-r-[3px] border-current ${cornerToneClass(faceBox.tone)}`} />
        </div>
      )}

      {liveRecognition && (
        <div className="absolute left-4 bottom-4 z-20 max-w-[300px] rounded-xl border-2 border-emerald-400/60 bg-emerald-950/90 px-3 py-2.5 text-xs text-white shadow-[0_0_24px_rgba(52,211,153,0.35)]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            {liveRecognition.action === "CHECK_IN" ||
            liveRecognition.action === "CHECK_OUT"
              ? `✓ ${actionLabel(liveRecognition.action)}`
              : "✓ Face Recognized"}
          </p>
          <p className="mt-1 text-sm font-semibold">{liveRecognition.employee_name}</p>
          <p className="text-slate-300">
            ID: {liveRecognition.employee_code || "—"}
            {liveRecognition.department ? ` · ${liveRecognition.department}` : ""}
          </p>
          {liveRecognition.attendance_status && (
            <p className="text-emerald-200">
              {actionLabel(liveRecognition.action)} · {liveRecognition.attendance_status}
              {liveRecognition.late_minutes > 0
                ? ` · ${liveRecognition.late_minutes} min late`
                : ""}
            </p>
          )}
          <p className="text-slate-400">
            {Math.round(liveRecognition.confidence * 100)}% · {cameraLabel}
          </p>
          <p className="text-slate-500">
            {formatReportTime(liveRecognition.event_time)}
          </p>
        </div>
      )}

      {showBadge && (
        <div className="absolute right-14 top-4 flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/90 px-2 py-1 text-[10px] font-bold text-white">
            <ScanFace size={11} />
            {scanPhase.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
});

export default LiveAttendanceScanner;
