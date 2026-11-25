import "server-only";

import { buildCpPlusOnvifSnapshotUrl, isJpegBuffer } from "@/utils/cp-plus-http";
import { fetchWithDigestAuth } from "@/utils/http-digest-fetch";
import { ProbeCameraInput } from "@/types/camera-probe";

const urlCache = new Map<string, string>();

function cacheKey(input: ProbeCameraInput, preview: boolean) {
  const host = input.camera_ip?.trim() ?? "";
  const channel = input.rtsp_channel ?? 1;
  const subtype = preview ? 1 : (input.rtsp_subtype ?? 0);
  return `${host}:${channel}:${subtype}`;
}

export async function captureOnvifSnapshot(
  input: ProbeCameraInput,
  options?: { preview?: boolean }
): Promise<Buffer | null> {
  const host = input.camera_ip?.trim();
  const username = input.rtsp_username?.trim();
  const password = input.rtsp_password ?? "";
  if (!host || !username || !password) return null;

  const preview = options?.preview ?? false;
  const channel = input.rtsp_channel ?? 1;
  const subtype = preview ? 1 : (input.rtsp_subtype ?? 0);
  const httpPort = input.http_port ?? 80;

  const urls = [
    buildCpPlusOnvifSnapshotUrl({ host, httpsPort: 443, channel, subtype }),
    `http://${host}:${httpPort}/onvifsnapshot/media_service/snapshot?channel=${channel}&subtype=${subtype}`,
  ];

  const key = cacheKey(input, preview);
  const cachedUrl = urlCache.get(key);
  if (cachedUrl) {
    const cachedFrame = await fetchWithDigestAuth(cachedUrl, username, password);
    if (cachedFrame && isJpegBuffer(cachedFrame)) return cachedFrame;
  }

  for (const url of urls) {
    const frame = await fetchWithDigestAuth(url, username, password);
    if (frame && isJpegBuffer(frame)) {
      urlCache.set(key, url);
      return frame;
    }
  }

  return null;
}
