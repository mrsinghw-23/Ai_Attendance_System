import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { FaceImageType } from "@/types/face-registration";

export interface DetectedFaceFrame {
  detected: boolean;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  yaw: number;
  pitch: number;
  faceSizeRatio: number;
}

export interface FaceOval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ScanOverlayDrawOptions {
  overlayWidth: number;
  overlayHeight: number;
  img: HTMLImageElement;
  frame: DetectedFaceFrame | null;
  smoothOval: FaceOval | null;
  ready: boolean;
  scanPhase: number;
  showGuide: boolean;
}

export interface PoseGuide {
  type: FaceImageType;
  title: string;
  instruction: string;
}

export const LIVE_ENROLLMENT_STEPS: PoseGuide[] = [
  {
    type: "FRONT",
    title: "Look Front",
    instruction: "Face the camera directly and hold still",
  },
  {
    type: "LEFT",
    title: "Turn Left",
    instruction: "Slowly turn your head to the left",
  },
  {
    type: "RIGHT",
    title: "Turn Right",
    instruction: "Slowly turn your head to the right",
  },
  {
    type: "UP",
    title: "Look Up",
    instruction: "Tilt your head slightly upward",
  },
];

const POSE_THRESHOLDS = {
  /** Laptop webcams — natural chin-down bias is compensated in poseMatchesTarget. */
  FRONT: { yaw: 0.2, pitch: 0.22 },
  LEFT: { yaw: 0.07, pitch: 0.22 },
  RIGHT: { yaw: -0.07, pitch: 0.22 },
  UP: { yaw: 0.2, pitch: 0.0 },
  DOWN: { yaw: 0.2, pitch: 0.1 },
};

/** Typical pitch offset when user looks straight at a laptop webcam (chin slightly down). */
const FRONT_PITCH_BIAS = 0.07;

const CCTV_POSE_THRESHOLDS = {
  FRONT: { yaw: 0.2, pitch: 0.35 },
  LEFT: { yaw: 0.05, pitch: 0.45 },
  RIGHT: { yaw: -0.05, pitch: 0.45 },
  UP: { yaw: 0.25, pitch: -0.02 },
  DOWN: { yaw: 0.25, pitch: 0.02 },
};

/** Minimum face area (normalized) before enrollment capture is allowed. */
export const MIN_ENROLLMENT_FACE_SIZE_RATIO = 0.012;
/** Ideal face size for a sharp enrollment scan without moving closer. */
export const OPTIMAL_ENROLLMENT_FACE_SIZE_RATIO = 0.028;
/** Fixed oval output — far faces are digitally zoomed to this size. */
export const FACE_CAPTURE_OUTPUT_PX = 512;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export async function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker();
  }
  return landmarkerPromise;
}

async function createLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export function analyzeFrameSource(
  landmarker: FaceLandmarker,
  source: CanvasImageSource,
  frameWidth: number,
  frameHeight: number
): DetectedFaceFrame {
  if (frameWidth < 64 || frameHeight < 64) {
    return EMPTY_FRAME;
  }

  try {
    const result = landmarker.detect(source as HTMLCanvasElement);
    const face = result.faceLandmarks?.[0];

    if (!face || face.length < 264) {
      return EMPTY_FRAME;
    }

    const xs = face.map((point) => point.x);
    const ys = face.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const leftEye = face[33];
    const rightEye = face[263];
    const nose = face[1];

    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const eyeSpan = Math.max(Math.abs(rightEye.x - leftEye.x), 0.01);

    const yaw = (nose.x - eyeMidX) / eyeSpan;
    const pitch = (nose.y - eyeMidY) / eyeSpan;

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      detected: true,
      confidence: Math.min(1, width * height * 8),
      box: {
        x: minX * frameWidth,
        y: minY * frameHeight,
        width: width * frameWidth,
        height: height * frameHeight,
      },
      yaw,
      pitch,
      faceSizeRatio: width * height,
    };
  } catch {
    return EMPTY_FRAME;
  }
}

export function analyzeVideoFrame(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  _timestampMs: number
): DetectedFaceFrame {
  return analyzeFrameSource(
    landmarker,
    video,
    video.videoWidth,
    video.videoHeight
  );
}

export function frontPosePitch(frame: DetectedFaceFrame): number {
  return frame.pitch - FRONT_PITCH_BIAS;
}

export function computePoseAlignment(
  target: FaceImageType,
  frame: DetectedFaceFrame,
  options?: { cctvMode?: boolean }
): number {
  if (!frame.detected) return 0;

  const table = options?.cctvMode ? CCTV_POSE_THRESHOLDS : POSE_THRESHOLDS;
  const thresholds = table[target as keyof typeof table];
  if (!thresholds) return 1;

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  switch (target) {
    case "FRONT": {
      const yawScore = clamp01(1 - Math.abs(frame.yaw) / thresholds.yaw);
      const pitchScore = clamp01(
        1 - Math.abs(frontPosePitch(frame)) / thresholds.pitch
      );
      return (yawScore + pitchScore) / 2;
    }
    case "LEFT": {
      const yawScore = clamp01((frame.yaw - thresholds.yaw * 0.35) / (thresholds.yaw * 0.65));
      const pitchScore = clamp01(1 - Math.abs(frame.pitch) / thresholds.pitch);
      return (yawScore + pitchScore) / 2;
    }
    case "RIGHT": {
      const yawScore = clamp01(
        (thresholds.yaw * 0.35 - frame.yaw) / (Math.abs(thresholds.yaw) * 0.65)
      );
      const pitchScore = clamp01(1 - Math.abs(frame.pitch) / thresholds.pitch);
      return (yawScore + pitchScore) / 2;
    }
    case "UP": {
      const pitchScore = clamp01(
        (thresholds.pitch - frame.pitch) / (Math.abs(thresholds.pitch) + 0.08)
      );
      const yawScore = clamp01(1 - Math.abs(frame.yaw) / thresholds.yaw);
      return (yawScore + pitchScore) / 2;
    }
    case "DOWN": {
      const pitchScore = clamp01(
        (frame.pitch - thresholds.pitch) / (Math.abs(thresholds.pitch) + 0.08)
      );
      const yawScore = clamp01(1 - Math.abs(frame.yaw) / thresholds.yaw);
      return (yawScore + pitchScore) / 2;
    }
    default:
      return 1;
  }
}

export function poseMatchesTarget(
  target: FaceImageType,
  frame: DetectedFaceFrame,
  options?: { cctvMode?: boolean }
): boolean {
  if (!frame.detected || frame.faceSizeRatio < MIN_ENROLLMENT_FACE_SIZE_RATIO)
    return false;

  const table = options?.cctvMode ? CCTV_POSE_THRESHOLDS : POSE_THRESHOLDS;
  const thresholds = table[target as keyof typeof table];
  if (!thresholds) return frame.detected;

  switch (target) {
    case "FRONT":
      return (
        Math.abs(frame.yaw) <= thresholds.yaw &&
        Math.abs(frontPosePitch(frame)) <= thresholds.pitch
      );
    case "LEFT":
      return frame.yaw >= thresholds.yaw && Math.abs(frame.pitch) <= thresholds.pitch;
    case "RIGHT":
      return frame.yaw <= thresholds.yaw && Math.abs(frame.pitch) <= thresholds.pitch;
    case "UP":
      return frame.pitch <= thresholds.pitch && Math.abs(frame.yaw) <= thresholds.yaw;
    case "DOWN":
      return frame.pitch >= thresholds.pitch && Math.abs(frame.yaw) <= thresholds.yaw;
    default:
      return frame.detected;
  }
}

export function getFaceDistanceHint(frame: DetectedFaceFrame): string | null {
  if (!frame.detected) return null;
  if (frame.faceSizeRatio < MIN_ENROLLMENT_FACE_SIZE_RATIO) {
    return "Move much closer — face too far to scan";
  }
  if (frame.faceSizeRatio < OPTIMAL_ENROLLMENT_FACE_SIZE_RATIO) {
    return "Move a little closer — focusing on your face";
  }
  if (frame.faceSizeRatio > 0.14) {
    return "Move back slightly — face too close";
  }
  return null;
}

export function isFaceLargeEnoughForCapture(frame: DetectedFaceFrame): boolean {
  return frame.detected && frame.faceSizeRatio >= MIN_ENROLLMENT_FACE_SIZE_RATIO;
}

export function getPoseHint(
  target: FaceImageType,
  frame: DetectedFaceFrame,
  options?: { cctvMode?: boolean }
): string | null {
  if (!frame.detected) return null;

  const distanceHint = getFaceDistanceHint(frame);
  if (distanceHint) return distanceHint;

  if (poseMatchesTarget(target, frame, options)) return null;

  const table = options?.cctvMode ? CCTV_POSE_THRESHOLDS : POSE_THRESHOLDS;
  const thresholds = table[target as keyof typeof table];
  if (!thresholds) return null;

  switch (target) {
    case "FRONT":
      if (Math.abs(frame.yaw) > thresholds.yaw) {
        return "Look straight at the camera";
      }
      if (frontPosePitch(frame) > thresholds.pitch) {
        return "Look straight at the camera — no need to tilt up";
      }
      if (frontPosePitch(frame) < -thresholds.pitch) {
        return "Look straight at the camera";
      }
      return "Look straight at the camera";
    case "LEFT":
      return frame.yaw < thresholds.yaw * 0.5
        ? "Turn your head more to the left"
        : "Hold your head still to the left";
    case "RIGHT":
      return frame.yaw > thresholds.yaw * 0.5
        ? "Turn your head more to the right"
        : "Hold your head still to the right";
    case "UP":
      return frame.pitch > thresholds.pitch
        ? "Tilt your head up just a little"
        : "Hold your head still";
    case "DOWN":
      return frame.pitch < thresholds.pitch
        ? "Tilt your head down just a little"
        : "Hold your head still";
    default:
      return null;
  }
}

export function estimateLiveQuality(frame: DetectedFaceFrame): number {
  if (!frame.detected) return 0;

  let score = 0.35;
  if (frame.faceSizeRatio >= 0.02) score += 0.15;
  if (frame.faceSizeRatio >= 0.04) score += 0.15;
  if (frame.faceSizeRatio >= 0.06) score += 0.1;
  if (frame.confidence >= 0.35) score += 0.1;
  if (frame.confidence >= 0.55) score += 0.1;
  if (frame.confidence >= 0.75) score += 0.05;

  return Math.min(1, Number(score.toFixed(3)));
}

export function computeMatchAccuracy(
  frame: DetectedFaceFrame,
  matches: boolean,
  minQuality: number,
  stableCount: number,
  stableRequired = AUTO_CAPTURE_STABLE_FRAMES,
  poseTarget?: FaceImageType,
  cctvMode = false
): number {
  if (!frame.detected) return 0;

  const quality = estimateLiveQuality(frame);
  let acc = 12 + Math.round(quality * 42);

  if (isFaceLargeEnoughForCapture(frame)) acc += 10;

  if (matches) {
    acc += 8;
    if (poseTarget) {
      acc += Math.round(computePoseAlignment(poseTarget, frame, { cctvMode }) * 32);
    } else {
      acc += 18;
    }
  }

  if (quality >= minQuality) acc += 8;

  if (matches && quality >= minQuality && stableCount > 0) {
    acc += Math.round(
      Math.min(16, (stableCount / Math.max(1, stableRequired)) * 16)
    );
  }

  if (matches && quality >= minQuality && stableCount >= stableRequired) {
    acc = Math.max(acc, 100);
  } else if (matches && quality >= minQuality && stableCount >= stableRequired - 1) {
    acc = Math.max(acc, 96);
  }

  return Math.min(100, acc);
}

export function computeStepProgress(
  frame: DetectedFaceFrame,
  matches: boolean,
  minQuality: number,
  stableCount: number,
  stableRequired = 3
): number {
  return computeMatchAccuracy(
    frame,
    matches,
    minQuality,
    stableCount,
    stableRequired
  );
}

export type FrameSource = HTMLImageElement | HTMLVideoElement;

export function isFrameSourceReady(
  source: FrameSource | null | undefined
): source is FrameSource {
  if (!source) return false;
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= 2 && source.videoWidth > 0;
  }
  return source.complete && source.naturalWidth > 0;
}

export function getFrameSourceSize(source: FrameSource) {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

export function prepareAnalysisCanvas(
  source: FrameSource,
  canvas: HTMLCanvasElement,
  options?: { maxWidth?: number }
): { width: number; height: number; scale: number } | null {
  if (!isFrameSourceReady(source)) return null;

  const { width: naturalWidth, height: naturalHeight } = getFrameSourceSize(source);
  const maxWidth = options?.maxWidth ?? DETECT_MAX_WIDTH;
  const scale = Math.min(1, maxWidth / naturalWidth);
  const width = Math.max(64, Math.round(naturalWidth * scale));
  const height = Math.max(64, Math.round(naturalHeight * scale));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: false, alpha: false });
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, width, height);
  return { width, height, scale };
}

export function mapBoxToNatural(
  box: DetectedFaceFrame["box"],
  analysisScale: number
) {
  return {
    x: box.x / analysisScale,
    y: box.y / analysisScale,
    width: box.width / analysisScale,
    height: box.height / analysisScale,
  };
}

export function boxToOval(box: DetectedFaceFrame["box"]): FaceOval {
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    rx: box.width * 0.58,
    ry: box.height * 0.72,
  };
}

export function lerpOval(
  prev: FaceOval | null,
  next: FaceOval | null,
  t: number
): FaceOval | null {
  if (!next) {
    if (!prev) return null;
    return {
      cx: prev.cx,
      cy: prev.cy,
      rx: prev.rx * (1 - t),
      ry: prev.ry * (1 - t),
    };
  }
  if (!prev) return next;
  return {
    cx: prev.cx + (next.cx - prev.cx) * t,
    cy: prev.cy + (next.cy - prev.cy) * t,
    rx: prev.rx + (next.rx - prev.rx) * t,
    ry: prev.ry + (next.ry - prev.ry) * t,
  };
}

function getContainTransform(
  source: FrameSource,
  overlayWidth: number,
  overlayHeight: number
) {
  const { width, height } = getFrameSourceSize(source);
  const containScale = Math.min(
    overlayWidth / width,
    overlayHeight / height
  );
  const displayW = width * containScale;
  const displayH = height * containScale;
  const offsetX = (overlayWidth - displayW) / 2;
  const offsetY = (overlayHeight - displayH) / 2;
  return { containScale, offsetX, offsetY };
}

export function mapOvalToOverlay(
  oval: FaceOval,
  source: FrameSource,
  overlayWidth: number,
  overlayHeight: number
): FaceOval {
  const { containScale, offsetX, offsetY } = getContainTransform(
    source,
    overlayWidth,
    overlayHeight
  );
  return {
    cx: oval.cx * containScale + offsetX,
    cy: oval.cy * containScale + offsetY,
    rx: oval.rx * containScale,
    ry: oval.ry * containScale,
  };
}

export function getGuideOval(
  overlayWidth: number,
  overlayHeight: number
): FaceOval {
  const size = Math.min(overlayWidth, overlayHeight);
  return {
    cx: overlayWidth / 2,
    cy: overlayHeight / 2,
    rx: size * 0.17,
    ry: size * 0.22,
  };
}

function strokeEllipse(
  ctx: CanvasRenderingContext2D,
  oval: FaceOval,
  color: string,
  lineWidth: number,
  dash: number[] = []
) {
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function fillEllipseScanLine(
  ctx: CanvasRenderingContext2D,
  oval: FaceOval,
  scanPhase: number,
  color: string
) {
  const y = oval.cy - oval.ry + scanPhase * oval.ry * 2;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(oval.cx - oval.rx, y);
  ctx.lineTo(oval.cx + oval.rx, y);
  ctx.stroke();
  ctx.restore();
}

export function drawFaceScanOverlay(
  ctx: CanvasRenderingContext2D,
  options: ScanOverlayDrawOptions
) {
  const {
    overlayWidth,
    overlayHeight,
    img,
    frame,
    smoothOval,
    ready,
    scanPhase,
    showGuide,
  } = options;

  ctx.clearRect(0, 0, overlayWidth, overlayHeight);

  const activeOval =
    frame?.detected && smoothOval && smoothOval.rx > 4
      ? mapOvalToOverlay(smoothOval, img, overlayWidth, overlayHeight)
      : showGuide
        ? getGuideOval(overlayWidth, overlayHeight)
        : null;

  if (!activeOval) return;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, overlayWidth, overlayHeight);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.ellipse(
    activeOval.cx,
    activeOval.cy,
    activeOval.rx,
    activeOval.ry,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  const ringColor = ready
    ? "rgba(34,197,94,0.95)"
    : frame?.detected
      ? "rgba(34,211,238,0.95)"
      : "rgba(125,211,252,0.55)";

  strokeEllipse(ctx, activeOval, ringColor, ready ? 3 : 2.5, showGuide ? [8, 6] : []);

  ctx.save();
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = ready ? 16 : 10;
  strokeEllipse(ctx, activeOval, ringColor, 1, []);
  ctx.restore();

  if (frame?.detected || showGuide) {
    fillEllipseScanLine(
      ctx,
      activeOval,
      scanPhase,
      ready ? "rgba(34,197,94,0.7)" : "rgba(34,211,238,0.65)"
    );
  }

  if (frame?.detected && !ready) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    strokeEllipse(
      ctx,
      {
        cx: activeOval.cx,
        cy: activeOval.cy,
        rx: activeOval.rx * 0.82,
        ry: activeOval.ry * 0.82,
      },
      "rgba(34,211,238,0.8)",
      1,
      [4, 8]
    );
    ctx.restore();
  }
}

export function computeFaceCropRect(
  box: DetectedFaceFrame["box"],
  imageWidth: number,
  imageHeight: number,
  padding = 0.42
) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const halfW = (box.width * (1 + padding)) / 2;
  const halfH = (box.height * (1 + padding * 1.25)) / 2;
  const size = Math.max(halfW * 2, halfH * 2, FACE_CROP_MIN_PX);

  let x = cx - size / 2;
  let y = cy - size / 2;
  x = Math.max(0, Math.min(x, imageWidth - size));
  y = Math.max(0, Math.min(y, imageHeight - size));

  const width = Math.min(size, imageWidth - x);
  const height = Math.min(size, imageHeight - y);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function mapFaceBoxToOverlay(
  box: DetectedFaceFrame["box"],
  source: FrameSource,
  analysisScale: number,
  overlayWidth: number,
  overlayHeight: number
) {
  const naturalBox = mapBoxToNatural(box, analysisScale);
  const { containScale, offsetX, offsetY } = getContainTransform(
    source,
    overlayWidth,
    overlayHeight
  );

  return {
    x: naturalBox.x * containScale + offsetX,
    y: naturalBox.y * containScale + offsetY,
    width: naturalBox.width * containScale,
    height: naturalBox.height * containScale,
  };
}

export async function detectFaceForCapture(
  source: FrameSource,
  landmarker: FaceLandmarker,
  analysisCanvas?: HTMLCanvasElement
): Promise<{
  frame: DetectedFaceFrame;
  naturalBox: DetectedFaceFrame["box"];
} | null> {
  if (!isFrameSourceReady(source)) return null;

  const canvas = analysisCanvas ?? document.createElement("canvas");
  const prep = prepareAnalysisCanvas(source, canvas, {
    maxWidth: DETECT_MAX_WIDTH_HD,
  });
  if (!prep) return null;

  const frame = analyzeFrameSource(
    landmarker,
    canvas,
    prep.width,
    prep.height
  );
  if (!isFaceLargeEnoughForCapture(frame)) return null;

  return {
    frame,
    naturalBox: mapBoxToNatural(frame.box, prep.scale),
  };
}

export async function captureFaceFromSource(
  source: FrameSource,
  faceBoxNatural: DetectedFaceFrame["box"] | null,
  options?: { jpegQuality?: number }
): Promise<{ blob: Blob | null; cropped: boolean }> {
  if (!isFrameSourceReady(source)) return { blob: null, cropped: false };

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: null, cropped: false };

  const { width: sourceWidth, height: sourceHeight } = getFrameSourceSize(source);

  if (
    !faceBoxNatural ||
    faceBoxNatural.width < 20 ||
    faceBoxNatural.height < 20
  ) {
    return { blob: null, cropped: false };
  }

  const oval = boxToOval(faceBoxNatural);
  const margin = 1.12;
  const cropHalf = Math.max(oval.rx, oval.ry) * margin;

  let srcCx = oval.cx;
  let srcCy = oval.cy;
  srcCx = Math.max(cropHalf, Math.min(srcCx, sourceWidth - cropHalf));
  srcCy = Math.max(cropHalf, Math.min(srcCy, sourceHeight - cropHalf));

  const maxHalf = Math.min(
    srcCx,
    sourceWidth - srcCx,
    srcCy,
    sourceHeight - srcCy
  );
  const srcSize = Math.min(cropHalf * 2, maxHalf * 2);
  const srcX = srcCx - srcSize / 2;
  const srcY = srcCy - srcSize / 2;

  const outSize = FACE_CAPTURE_OUTPUT_PX;
  canvas.width = outSize;
  canvas.height = outSize;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, outSize, outSize);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(outSize / 2, outSize / 2, outSize / 2, outSize / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, srcX, srcY, srcSize, srcSize, 0, 0, outSize, outSize);
  ctx.restore();

  const jpegQuality = options?.jpegQuality ?? 0.96;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", jpegQuality)
  );
  return { blob, cropped: Boolean(blob) };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

export async function cropFileToOvalFace(file: File): Promise<File> {
  const img = await loadImageFromFile(file);
  const landmarker = await getFaceLandmarker();
  const analysisCanvas = document.createElement("canvas");
  const prep = prepareAnalysisCanvas(img, analysisCanvas, {
    maxWidth: DETECT_MAX_WIDTH_HD,
  });
  if (!prep) {
    throw new Error("Could not process image.");
  }

  const frame = analyzeFrameSource(
    landmarker,
    analysisCanvas,
    prep.width,
    prep.height
  );
  if (!frame.detected) {
    throw new Error("No face detected. Center your face in the frame.");
  }
  if (!isFaceLargeEnoughForCapture(frame)) {
    throw new Error(
      "Face is too far from the camera. Move closer and try again."
    );
  }

  const naturalBox = mapBoxToNatural(frame.box, prep.scale);
  const { blob, cropped } = await captureFaceFromSource(img, naturalBox);
  if (!blob || !cropped) {
    throw new Error("Could not crop face oval.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "face";
  return new File([blob], `${baseName}-oval.jpg`, { type: "image/jpeg" });
}

export async function captureFaceFromImage(
  img: HTMLImageElement,
  faceBoxNatural: DetectedFaceFrame["box"] | null
): Promise<{ blob: Blob | null; cropped: boolean }> {
  return captureFaceFromSource(img, faceBoxNatural);
}

/** @deprecated use captureFaceFromImage */
export async function captureFrameFromImage(
  img: HTMLImageElement
): Promise<Blob | null> {
  const result = await captureFaceFromImage(img, null);
  return result.blob;
}

export function createSessionId() {
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const STABLE_FRAMES_REQUIRED = 6;
export const MIN_LIVE_QUALITY = 0.55;
export const MIN_LIVE_QUALITY_CCTV = 0.45;
export const LIVE_DETECT_INTERVAL_MS = 420;
export const ENROLLMENT_POLL_MS = 420;
export const DETECT_MAX_WIDTH = 288;
export const DETECT_MAX_WIDTH_CCTV = 640;
export const DETECT_MAX_WIDTH_HD = 1280;

export function toSquareFaceBox(box: DetectedFaceFrame["box"], padding = 1.12) {
  const size = Math.max(box.width, box.height) * padding;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    x: cx - size / 2,
    y: cy - size / 2,
    width: size,
    height: size,
  };
}
export const FACE_CROP_MIN_PX = 384;
export const FACE_CROP_MAX_PX = 1280;
export const AUTO_CAPTURE_ACCURACY = 95;
export const AUTO_CAPTURE_STABLE_FRAMES = 2;

const EMPTY_FRAME: DetectedFaceFrame = {
  detected: false,
  confidence: 0,
  box: { x: 0, y: 0, width: 0, height: 0 },
  yaw: 0,
  pitch: 0,
  faceSizeRatio: 0,
};

export function isBenignMediaPipeLog(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes("tensorflow lite") ||
    text.includes("xnnpack delegate") ||
    text.includes("created tensorflow lite") ||
    text.includes("info: created tensorflow lite")
  );
}

function installMediaPipeLogFilter() {
  const win = window as Window & { __mpLogFilterInstalled?: boolean };
  if (win.__mpLogFilterInstalled) return;
  win.__mpLogFilterInstalled = true;

  const wrap = <T extends (...args: unknown[]) => void>(fn: T): T => {
    return ((...args: unknown[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : String(arg)))
        .join(" ");
      if (isBenignMediaPipeLog(message)) return;
      fn(...args);
    }) as T;
  };

  console.error = wrap(console.error.bind(console));
  console.warn = wrap(console.warn.bind(console));
}

if (typeof window !== "undefined") {
  installMediaPipeLogFilter();
  void getFaceLandmarker();
}
