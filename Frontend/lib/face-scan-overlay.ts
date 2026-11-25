import type { DetectedFaceFrame, FaceOval } from "@/lib/live-face-enrollment";

type OverlayFrameSource = HTMLImageElement | HTMLVideoElement;

function getOverlaySourceSize(source: OverlayFrameSource) {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

export interface ImperativeScanOverlay {
  setSize(width: number, height: number): void;
  setGuideMode(active: boolean): void;
  setTargetOval(
    oval: FaceOval | null,
    source: OverlayFrameSource | null,
    ready: boolean,
    faceDetected: boolean
  ): void;
  tick(scanPhase: number): void;
  clear(): void;
  destroy(): void;
}

function mapNaturalOvalToDisplay(
  oval: FaceOval,
  source: OverlayFrameSource,
  width: number,
  height: number
): FaceOval {
  const { width: naturalWidth, height: naturalHeight } =
    getOverlaySourceSize(source);
  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  const displayW = naturalWidth * scale;
  const displayH = naturalHeight * scale;
  const offsetX = (width - displayW) / 2;
  const offsetY = (height - displayH) / 2;
  return {
    cx: oval.cx * scale + offsetX,
    cy: oval.cy * scale + offsetY,
    rx: oval.rx * scale,
    ry: oval.ry * scale,
  };
}

function guideOval(width: number, height: number): FaceOval {
  const size = Math.min(width, height);
  return {
    cx: width / 2,
    cy: height / 2,
    rx: size * 0.17,
    ry: size * 0.22,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpOvalDisplay(prev: FaceOval, next: FaceOval, t: number): FaceOval {
  return {
    cx: lerp(prev.cx, next.cx, t),
    cy: lerp(prev.cy, next.cy, t),
    rx: lerp(prev.rx, next.rx, t),
    ry: lerp(prev.ry, next.ry, t),
  };
}

export function createImperativeScanOverlay(
  root: HTMLDivElement,
  ringCanvas: HTMLCanvasElement
): ImperativeScanOverlay {
  const vignette = document.createElement("div");
  vignette.className = "pointer-events-none absolute inset-0 transition-none";
  vignette.style.background = "rgba(0,0,0,0.38)";
  vignette.style.opacity = "1";
  root.appendChild(vignette);

  let width = 1;
  let height = 1;
  let guideMode = true;
  let ready = false;
  let faceDetected = false;
  let target: FaceOval | null = null;
  let display: FaceOval | null = null;
  let imgEl: OverlayFrameSource | null = null;

  const sourceReady = () => {
    if (!imgEl) return false;
    const { width: w, height: h } = getOverlaySourceSize(imgEl);
    return w > 0 && h > 0;
  };

  const applyMask = (oval: FaceOval) => {
    vignette.style.webkitMaskImage = `radial-gradient(ellipse ${oval.rx * 2}px ${oval.ry * 2}px at ${oval.cx}px ${oval.cy}px, transparent 68%, black 72%)`;
    vignette.style.maskImage = vignette.style.webkitMaskImage;
  };

  const drawRing = (oval: FaceOval, phase: number) => {
    const ctx = ringCanvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const color = ready
      ? "rgba(34,197,94,0.95)"
      : faceDetected
        ? "rgba(34,211,238,0.95)"
        : "rgba(125,211,252,0.6)";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = ready ? 3 : 2.5;
    if (guideMode && !faceDetected) {
      ctx.setLineDash([8, 6]);
    }
    ctx.beginPath();
    ctx.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowColor = color;
    ctx.shadowBlur = ready ? 14 : 8;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    if (faceDetected || guideMode) {
      const y = oval.cy - oval.ry + phase * oval.ry * 2;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = ready
        ? "rgba(34,197,94,0.75)"
        : "rgba(34,211,238,0.7)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(oval.cx - oval.rx, y);
      ctx.lineTo(oval.cx + oval.rx, y);
      ctx.stroke();
      ctx.restore();
    }

    if (faceDetected && !ready) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "rgba(34,211,238,0.85)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.ellipse(
        oval.cx,
        oval.cy,
        oval.rx * 0.82,
        oval.ry * 0.82,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }
  };

  const resolveTarget = (): FaceOval | null => {
    if (faceDetected && target && target.rx > 2 && sourceReady()) {
      return mapNaturalOvalToDisplay(target, imgEl!, width, height);
    }
    if (guideMode) return guideOval(width, height);
    return display;
  };

  return {
    setSize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      ringCanvas.width = width;
      ringCanvas.height = height;
    },
    setGuideMode(active) {
      guideMode = active;
    },
    setTargetOval(oval, source, isReady, detected) {
      target = oval;
      imgEl = source;
      ready = isReady;
      faceDetected = detected;
      guideMode = !detected;
    },
    tick(scanPhase) {
      const next = resolveTarget();
      if (!next) return;

      display = display
        ? lerpOvalDisplay(display, next, faceDetected ? 0.32 : 0.2)
        : next;

      applyMask(display);
      drawRing(display, scanPhase);
    },
    clear() {
      target = null;
      display = null;
      imgEl = null;
      vignette.style.maskImage = "none";
      vignette.style.webkitMaskImage = "none";
      const ctx = ringCanvas.getContext("2d");
      ctx?.clearRect(0, 0, width, height);
    },
    destroy() {
      vignette.remove();
      target = null;
      display = null;
      imgEl = null;
      const ctx = ringCanvas.getContext("2d");
      ctx?.clearRect(0, 0, width, height);
    },
  };
}

export type { DetectedFaceFrame };
