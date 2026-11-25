import "server-only";

const DEFAULT_TTL_MS = 500;
const MAX_STALE_MS = 2500;

type CacheEntry = {
  buffer: Buffer;
  capturedAt: number;
};

type InflightEntry = {
  promise: Promise<Buffer | null>;
};

const frameCache = new Map<string, CacheEntry>();
const inflight = new Map<string, InflightEntry>();

export function getCachedCameraFrame(
  cacheKey: string,
  maxAgeMs = DEFAULT_TTL_MS
): Buffer | null {
  const entry = frameCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.capturedAt > maxAgeMs) return null;
  return entry.buffer;
}

export function setCachedCameraFrame(cacheKey: string, buffer: Buffer) {
  frameCache.set(cacheKey, { buffer, capturedAt: Date.now() });
}

export async function captureCameraFrameCached(
  cameraId: number,
  capture: () => Promise<Buffer | null>,
  options?: { ttlMs?: number; allowStaleMs?: number; variant?: string }
): Promise<Buffer | null> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const allowStaleMs = options?.allowStaleMs ?? MAX_STALE_MS;
  const cacheKey = `${cameraId}:${options?.variant ?? "full"}`;

  const fresh = getCachedCameraFrame(cacheKey, ttlMs);
  if (fresh) return fresh;

  const stale = getCachedCameraFrame(cacheKey, allowStaleMs);
  const pending = inflight.get(cacheKey);
  if (pending) {
    const result = await pending.promise;
    return result ?? stale;
  }

  const promise = capture().finally(() => {
    inflight.delete(cacheKey);
  });
  inflight.set(cacheKey, { promise });

  const frame = await promise;
  if (frame) {
    setCachedCameraFrame(cacheKey, frame);
    return frame;
  }

  return stale;
}
