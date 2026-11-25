import "server-only";

import { captureOnvifSnapshot } from "@/services/camera-onvif-capture.service";
import { captureHttpSnapshot } from "@/services/camera-node-capture.service";
import { captureCameraFrameCached } from "@/services/camera-frame-cache.service";
import { getCameraStreamSecrets } from "@/services/camera-stream-credentials.service";
import { captureCameraFrameRtsp } from "@/services/camera-probe.service";
import { isJpegBuffer } from "@/utils/cp-plus-http";

async function fetchCameraFrame(
  cameraId: number,
  preview = false
): Promise<Buffer | null> {
  const camera = await getCameraStreamSecrets(cameraId);
  if (!camera?.camera_ip) return null;
  if (camera.status === "INACTIVE") return null;

  const input = {
    camera_ip: camera.camera_ip,
    http_port: camera.http_port,
    port: camera.port,
    rtsp_channel: camera.rtsp_channel,
    rtsp_subtype: camera.rtsp_subtype,
    rtsp_username: camera.rtsp_username,
    rtsp_password: camera.rtsp_password,
    brand: camera.brand ?? "CP Plus",
  };

  if (camera.rtsp_username && camera.rtsp_password) {
    const onvifFrame = await captureOnvifSnapshot(input, { preview });
    if (onvifFrame && isJpegBuffer(onvifFrame)) {
      return onvifFrame;
    }

    const httpFrame = await captureHttpSnapshot(input);
    if (httpFrame && isJpegBuffer(httpFrame)) {
      return httpFrame;
    }
  }

  const pythonFrame = await captureCameraFrameRtsp(cameraId, preview);
  if (pythonFrame && isJpegBuffer(pythonFrame)) {
    return pythonFrame;
  }

  return null;
}

export async function captureCameraFrame(
  cameraId: number,
  options?: { preview?: boolean; ttlMs?: number }
): Promise<Buffer | null> {
  const preview = options?.preview ?? false;
  const variant = preview ? "preview" : "full";
  const ttlMs = options?.ttlMs ?? (preview ? 200 : 600);

  return captureCameraFrameCached(
    cameraId,
    () => fetchCameraFrame(cameraId, preview),
    { ttlMs, allowStaleMs: preview ? 1800 : 2500, variant }
  );
}
