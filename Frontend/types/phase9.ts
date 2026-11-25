export type PresenceEventType = "IN" | "OUT";

export type AttendanceDayStatus = "FULL_DAY" | "HALF_DAY" | "ABSENT";

export interface AttendanceEngineConfig {
  onTimeStartHour: number;
  onTimeStartMinute: number;
  onTimeEndHour: number;
  onTimeEndMinute: number;
  checkOutAfterHour: number;
  checkOutAfterMinute: number;
  presenceGapMinutes: number;
  halfDayCutoffHour: number;
  halfDayCutoffMinute: number;
  standardWorkHours: number;
  minConfidence: number;
}

export interface EmployeePresenceLog {
  id: number;
  employee_id: number;
  camera_id: number | null;
  location_id: number | null;
  event_type: PresenceEventType;
  event_time: string;
  source: string;
  face_event_id: number | null;
  created_at: string;
}

export interface AttendanceSummary {
  id: number;
  employee_id: number;
  employee_code?: string;
  employee_name?: string;
  location_id: number | null;
  location_name?: string | null;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  working_hours: number;
  total_inside_minutes: number;
  total_outside_minutes: number;
  working_minutes: number;
  overtime_minutes: number;
  outside_duration: number;
  entries: number;
  exits: number;
  attendance_status: AttendanceDayStatus;
  late_minutes: number;
  created_at: string;
  updated_at: string | null;
}

export interface AttendanceEngineRun {
  id: number;
  run_type: string;
  status: string;
  events_processed: number;
  records_updated: number;
  summaries_updated: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface EmployeeEngineDashboard {
  present: number;
  absent: number;
  late: number;
  half_day: number;
  avg_working_hours: number;
  summaries: AttendanceSummary[];
  movement_logs: EmployeePresenceLog[];
}

export interface CameraEngineDashboard {
  total_cameras: number;
  online: number;
  offline: number;
  active_employees: number;
  camera_wise_attendance: Array<{
    camera_id: number;
    camera_name: string;
    location_name: string | null;
    detections: number;
    unique_employees: number;
    health_status: string;
  }>;
  recent_activity: Array<{
    camera_name: string;
    employee_name: string;
    event_time: string;
    confidence: number | null;
  }>;
}

export interface LocationEngineDashboard {
  locations: Array<{
    location_id: number;
    location_name: string;
    employee_count: number;
    camera_count: number;
    present_today: number;
    absent_today: number;
    late_today: number;
  }>;
}

export type EngineReportType =
  | "daily_attendance"
  | "employee_attendance"
  | "late_arrival"
  | "half_day"
  | "absent"
  | "working_hours"
  | "movement"
  | "camera_activity"
  | "location_attendance";
