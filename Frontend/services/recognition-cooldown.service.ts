import { getAIRecognitionSettings } from "@/services/ai-recognition.service";

const recentMatches = new Map<string, number>();
const recentUnknown = new Map<string, number>();

function key(scope: string | number, suffix: string) {
  return `${scope}:${suffix}`;
}

export async function getRecognitionCooldownMs() {
  const settings = await getAIRecognitionSettings();
  return Math.max(5, settings.recognitionCooldownSeconds) * 1000;
}

export async function getUnknownFaceCooldownMs() {
  const settings = await getAIRecognitionSettings();
  return Math.max(10, settings.unknownFaceCooldownSeconds) * 1000;
}

export function isRecognitionOnCooldown(
  scope: string | number,
  employeeId: number,
  cooldownMs: number
) {
  const mapKey = key(scope, String(employeeId));
  const last = recentMatches.get(mapKey);
  if (!last) return false;
  if (Date.now() - last < cooldownMs) return true;
  recentMatches.delete(mapKey);
  return false;
}

export function markRecognitionCooldown(
  scope: string | number,
  employeeId: number
) {
  recentMatches.set(key(scope, String(employeeId)), Date.now());
}

export function isUnknownFaceOnCooldown(
  scope: string | number,
  cooldownMs: number
) {
  const mapKey = key(scope, "unknown");
  const last = recentUnknown.get(mapKey);
  if (!last) return false;
  if (Date.now() - last < cooldownMs) return true;
  recentUnknown.delete(mapKey);
  return false;
}

export function markUnknownFaceCooldown(scope: string | number) {
  recentUnknown.set(key(scope, "unknown"), Date.now());
}
