export type CameraStatus = "ACTIVE" | "INACTIVE";

export type CameraHealthStatus =
  | "ONLINE"
  | "OFFLINE"
  | "WARNING"
  | "MAINTENANCE"
  | "UNKNOWN";

export type CameraRecordingStatus =
  | "RECORDING"
  | "NOT_RECORDING";

export type CameraEntryExitType =
  | "ENTRY"
  | "EXIT"
  | "BOTH"
  | "NONE";

export type CameraEventType =
  | "MOTION_DETECTED"
  | "CAMERA_OFFLINE"
  | "CAMERA_ONLINE"
  | "STREAM_ERROR"
  | "HEALTH_WARNING"
  | "AI_FACE_EVENT_LINKED";

export interface CameraZone {
  id: number;
  zone_name: string;
  location_id: number | null;
  location_name: string | null;
  description: string | null;
  floor: string | null;
  status: string;
  camera_count?: number;
  created_at: string;
  updated_at: string | null;
}

export interface Camera {
  id: number;
  camera_name: string;
  camera_code: string | null;
  camera_type: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  camera_ip: string | null;
  http_port: number | null;
  port: number | null;
  rtsp_channel: number | null;
  rtsp_subtype: number | null;
  rtsp_url: string | null;
  rtsp_username: string | null;
  has_rtsp_password: boolean;
  firmware: string | null;
  onvif_version: string | null;
  last_diagnostics: CameraDiagnostics | null;
  reconnect_count: number;
  location_id: number | null;
  location_name: string | null;
  zone_id: number | null;
  zone_name: string | null;
  floor: string | null;
  entry_exit_type: CameraEntryExitType;
  status: CameraStatus;
  health_status: CameraHealthStatus;
  last_seen: string | null;
  recording_status: CameraRecordingStatus;
  installation_date: string | null;
  warranty_date: string | null;
  motion_enabled: boolean;
  motion_sensitivity: number;
  last_motion_detected: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CameraStats {
  total: number;
  active: number;
  inactive: number;
  online: number;
  offline: number;
  warning: number;
  maintenance: number;
  errors: number;
  recording: number;
}

export interface LocationCameraReport {
  location_id: number;
  location_name: string;
  total: number;
  online: number;
  active: number;
}

export interface CameraListParams {
  search?: string;
  status?: CameraStatus | "";
  location_id?: number;
  zone_id?: number;
}

export interface CameraEvent {
  id: number;
  camera_id: number;
  camera_name?: string;
  event_type: CameraEventType;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CameraHealthLog {
  id: number;
  camera_id: number;
  camera_name?: string;
  health_status: CameraHealthStatus;
  latency_ms: number | null;
  camera_reachable: boolean;
  rtsp_reachable: boolean;
  stream_available: boolean;
  message: string | null;
  checked_at: string;
}

export interface CameraMapLocation {
  location_id: number;
  location_name: string;
  zones: Array<{
    zone_id: number | null;
    zone_name: string;
    floor: string | null;
    cameras: Array<{
      id: number;
      camera_name: string;
      camera_code: string | null;
      health_status: CameraHealthStatus;
      status: CameraStatus;
    }>;
  }>;
}

export interface CameraOperationsDashboard {
  stats: CameraStats;
  recent_events: CameraEvent[];
  health_timeline: CameraHealthLog[];
  motion_events: CameraEvent[];
  camera_attendance: Array<{
    camera_id: number;
    camera_name: string;
    location_name: string | null;
    detections_today: number;
    unique_employees: number;
  }>;
}

export interface CameraPipelineStage {
  id: string;
  name: string;
  description: string;
  status: "ready" | "planned" | "active";
  output: string;
}

export interface CameraPipelineArchitecture {
  title: string;
  description: string;
  stages: CameraPipelineStage[];
  notes: string[];
}

export interface CameraDiagnostics {
  success?: boolean;
  ping_ok: boolean;
  tcp_rtsp_ok: boolean;
  rtsp_connected: boolean;
  auth_success: boolean;
  frame_captured: boolean;
  camera_reachable: boolean;
  resolution?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  codec?: string | null;
  latency_ms?: number | null;
  bitrate_kbps?: number | null;
  firmware?: string | null;
  onvif_version?: string | null;
  health_status: CameraHealthStatus;
  error?: string | null;
  error_code?: string | null;
  checked_at?: string;
  camera_id?: number;
  camera_name?: string;
  /** System checks for diagnostics panel */
  opencv_ok?: boolean;
  python_service_ok?: boolean;
  database_ok?: boolean;
  attendance_engine_ok?: boolean;
  /** Runtime stats from AI worker */
  processing_fps?: number | null;
  recognition_fps?: number | null;
  motion_active?: boolean;
  last_frame_at?: string | null;
  ai_status?: string | null;
  packet_loss_pct?: number | null;
  uptime_seconds?: number | null;
}
