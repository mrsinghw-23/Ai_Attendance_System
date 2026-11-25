export type ReportType =
  | "attendance"
  | "employees"
  | "locations"
  | "cameras"
  | "audit"
  | "daily_attendance"
  | "employee_attendance"
  | "late_arrival"
  | "half_day"
  | "absent"
  | "working_hours"
  | "movement"
  | "camera_activity"
  | "location_attendance"
  | "camera_health"
  | "camera_uptime"
  | "camera_downtime"
  | "camera_attendance"
  | "motion_detection"
  | "location_camera"
  | "face_registration"
  | "missing_face_profiles"
  | "registration_progress"
  | "ai_face_recognition"
  | "ai_gate_attendance"
  | "unknown_faces";

export type ExportFormat = "csv" | "excel" | "pdf";

export interface ReportResult {
  title: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type NotificationType =
  | "ATTENDANCE"
  | "CAMERA"
  | "SYSTEM"
  | "SECURITY";

export interface Notification {
  id: number;
  user_id: number | null;
  role: string | null;
  title: string;
  message: string;
  type: NotificationType;
  priority: "LOW" | "NORMAL" | "HIGH";
  read_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface FaceEvent {
  id: number;
  camera_id: number | null;
  employee_id: number | null;
  location_id: number | null;
  event_time: string;
  confidence: number | null;
  event_type: string;
  image_ref: string | null;
  embedding_ref: string | null;
  metadata: Record<string, unknown>;
  processed: boolean;
  attendance_log_id: number | null;
  created_at: string;
}
