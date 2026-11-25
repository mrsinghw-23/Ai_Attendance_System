const ERROR_LABELS: Record<string, string> = {
  RTSP_AUTHENTICATION_FAILED: "RTSP Authentication Failed",
  NETWORK_TIMEOUT: "Network Timeout",
  INVALID_RTSP_URL: "Invalid RTSP URL",
  CAMERA_OFFLINE: "Camera Offline",
  NO_FRAMES_RECEIVED: "No Frames Received",
  DECODER_FAILED: "Decoder Failed",
};

export function formatProbeErrorCode(code?: string | null): string {
  if (!code) return "Connection failed";
  return ERROR_LABELS[code] || code.replace(/_/g, " ");
}
