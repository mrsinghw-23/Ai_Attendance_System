import {
  buildCpPlusRtspUrl,
  injectRtspCredentials,
  pathStyleForBrand,
  resolveRtspStreamUrlWithAuth,
  sanitizeRtspUrlForApi,
} from "@/utils/rtsp-url";

export type CameraStreamInput = {
  camera_ip: string | null;
  port: number | null;
  rtsp_url: string | null;
  rtsp_username?: string | null;
  rtsp_password?: string | null;
  rtsp_channel?: number | null;
  rtsp_subtype?: number | null;
  brand?: string | null;
  http_port?: number | null;
};

export type CameraStreamKind = "http-mjpeg" | "rtsp";

export { buildCpPlusRtspUrl, sanitizeRtspUrlForApi };

export function isRtspCamera(camera: CameraStreamInput): boolean {
  if (camera.rtsp_url?.trim().startsWith("rtsp://")) return true;
  return Boolean(camera.camera_ip?.trim());
}

export function isCctvConfiguredCamera(camera: CameraStreamInput): boolean {
  if (camera.rtsp_url?.trim().startsWith("rtsp://")) return true;
  return Boolean(camera.camera_ip?.trim());
}

export function resolveCameraStreamKind(
  _camera: CameraStreamInput
): CameraStreamKind {
  return "rtsp";
}

export function resolveCameraMjpegUrl(_camera: CameraStreamInput): string | null {
  return null;
}

export function resolveCameraSnapshotUrl(
  _camera: CameraStreamInput
): string | null {
  return null;
}

export function resolveRtspStreamUrl(
  camera: CameraStreamInput,
  decryptedPassword?: string | null
): string | null {
  return resolveRtspStreamUrlWithAuth(camera, decryptedPassword);
}

export function resolveRtspStreamUrlPublic(camera: CameraStreamInput): string | null {
  const raw = camera.rtsp_url?.trim();
  if (raw?.startsWith("rtsp://")) {
    return injectRtspCredentials(raw, camera.rtsp_username, null);
  }
  if (!camera.camera_ip?.trim()) return null;
  return buildCpPlusRtspUrl({
    host: camera.camera_ip,
    rtspPort: camera.port ?? 554,
    channel: camera.rtsp_channel ?? 1,
    subtype: camera.rtsp_subtype ?? 0,
    pathStyle: pathStyleForBrand(camera.brand),
    embedCredentials: false,
  });
}
