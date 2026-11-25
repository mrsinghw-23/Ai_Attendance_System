import {
  resolveCameraMjpegUrl,
  resolveCameraSnapshotUrl,
  type CameraStreamInput,
} from "@/utils/camera-stream";

export function cctvLiveStreamUrl(cameraId: number, session = Date.now()) {
  return `/api/cameras/${cameraId}/live?mode=mjpeg&session=${session}`;
}

export function cctvSnapshotUrl(cameraId: number, options?: { preview?: boolean }) {
  const preview = options?.preview ?? false;
  return `/api/cameras/${cameraId}/live?mode=snapshot&preview=${preview ? "1" : "0"}`;
}

export function resolveDirectStreamUrls(config?: CameraStreamInput | null) {
  if (!config) {
    return { mjpeg: null as string | null, snapshot: null as string | null };
  }

  return {
    mjpeg: resolveCameraMjpegUrl(config),
    snapshot: resolveCameraSnapshotUrl(config),
  };
}

export function appendCacheBust(url: string, tick: number) {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}_t=${tick}`;
}
