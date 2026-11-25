export type ProbeCameraInput = {
  camera_ip: string;
  port?: number | null;
  http_port?: number | null;
  rtsp_username?: string | null;
  rtsp_password?: string | null;
  rtsp_channel?: number | null;
  rtsp_subtype?: number | null;
  brand?: string | null;
  firmware?: string | null;
  onvif_version?: string | null;
  rtsp_direct_url?: string | null;
  rtsp_stream_url?: string | null;
};
