import { FaceQualityResult } from "@/types/face-registration";
import {
  estimateBlurScore,
  estimateBrightness,
  getImageDimensions,
} from "@/utils/image-metadata";

const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;
const MIN_QUALITY_SCORE = 0.55;

export function validateFaceImageQuality(
  buffer: Buffer,
  mimeType: string
): FaceQualityResult {
  const issues: string[] = [];
  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(mimeType)) {
    return {
      passed: false,
      score: 0,
      issues: ["Unsupported image format. Use JPG, PNG, or WEBP."],
      metrics: {
        width: 0,
        height: 0,
        brightness: 0,
        blurScore: 0,
        faceVisible: false,
        faceSizeOk: false,
        multipleFacesSuspected: false,
      },
    };
  }

  if (buffer.length < 10_000) {
    issues.push("Image file is too small.");
  }

  if (buffer.length > 5 * 1024 * 1024) {
    issues.push("Image file exceeds 5MB limit.");
  }

  const dimensions = getImageDimensions(buffer);
  const brightness = estimateBrightness(buffer);
  const blurScore = estimateBlurScore(buffer);
  const faceSizeOk =
    dimensions.width >= MIN_WIDTH && dimensions.height >= MIN_HEIGHT;
  const aspectRatio =
    dimensions.height > 0 ? dimensions.width / dimensions.height : 0;
  const multipleFacesSuspected = aspectRatio > 2.2;
  const faceVisible = faceSizeOk && brightness >= 0.18 && brightness <= 0.92;

  if (dimensions.width === 0 || dimensions.height === 0) {
    issues.push("Could not read image dimensions.");
  }

  if (!faceSizeOk) {
    issues.push(
      `Face image too small. Minimum ${MIN_WIDTH}x${MIN_HEIGHT} required.`
    );
  }

  if (brightness < 0.18) {
    issues.push("Image is too dark.");
  }

  if (brightness > 0.92) {
    issues.push("Image is overexposed.");
  }

  if (blurScore < 120) {
    issues.push("Image appears blurry.");
  }

  if (multipleFacesSuspected) {
    issues.push("Multiple faces may be present. Use a single-face photo.");
  }

  if (!faceVisible) {
    issues.push("Face is not clearly visible.");
  }

  let score = 1;
  score -= brightness < 0.25 || brightness > 0.85 ? 0.2 : 0;
  score -= blurScore < 180 ? 0.25 : 0;
  score -= !faceSizeOk ? 0.3 : 0;
  score -= multipleFacesSuspected ? 0.25 : 0;
  score = Math.max(0, Math.min(1, score));

  const passed = issues.length === 0 && score >= MIN_QUALITY_SCORE;

  return {
    passed,
    score: Number(score.toFixed(3)),
    issues,
    metrics: {
      width: dimensions.width,
      height: dimensions.height,
      brightness: Number(brightness.toFixed(3)),
      blurScore: Number(blurScore.toFixed(2)),
      faceVisible,
      faceSizeOk,
      multipleFacesSuspected,
    },
  };
}
