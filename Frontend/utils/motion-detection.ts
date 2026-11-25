import type { FrameSource } from "@/lib/live-face-enrollment";
import { getFrameSourceSize, isFrameSourceReady } from "@/lib/live-face-enrollment";

const SAMPLE_WIDTH = 160;

export function detectMotionFromSource(
  source: FrameSource,
  canvas: HTMLCanvasElement,
  prevFrame: ImageData | null,
  sensitivity = 25
): { motion: boolean; frame: ImageData | null } {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !isFrameSourceReady(source)) {
    return { motion: false, frame: prevFrame };
  }

  const { width: naturalWidth, height: naturalHeight } = getFrameSourceSize(source);
  const height = Math.max(
    1,
    Math.round((naturalHeight / naturalWidth) * SAMPLE_WIDTH)
  );
  canvas.width = SAMPLE_WIDTH;
  canvas.height = height;
  ctx.drawImage(source, 0, 0, SAMPLE_WIDTH, height);

  const frame = ctx.getImageData(0, 0, SAMPLE_WIDTH, height);
  if (
    !prevFrame ||
    prevFrame.width !== SAMPLE_WIDTH ||
    prevFrame.height !== height
  ) {
    return { motion: false, frame };
  }

  let diff = 0;
  const pixels = frame.data;
  const previous = prevFrame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    diff +=
      Math.abs(pixels[i] - previous[i]) +
      Math.abs(pixels[i + 1] - previous[i + 1]) +
      Math.abs(pixels[i + 2] - previous[i + 2]);
  }

  const score = diff / (pixels.length / 4) / 3;
  const threshold = Math.max(3, 40 - sensitivity * 0.35);
  return { motion: score >= threshold, frame };
}

/** @deprecated use detectMotionFromSource */
export function detectMotionFromImage(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  prevFrame: ImageData | null,
  sensitivity = 25
) {
  return detectMotionFromSource(img, canvas, prevFrame, sensitivity);
}
