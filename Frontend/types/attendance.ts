export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "EARLY_EXIT"
  | "OVERTIME"
  | "ABSENT";

export type AttendanceEventType =
  | "CHECK_IN"
  | "CHECK_OUT";

export type AttendanceSource =
  | "MANUAL"
  | "CAMERA"
  | "AI_FACE_RECOGNITION";

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_code: string;
  employee_name: string;
  location_id: number | null;
  location_name: string | null;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  working_hours: number;
  overtime_hours: number;
  status: AttendanceStatus;
  late_minutes: number;
  early_exit_minutes: number;
  created_at: string;
  updated_at: string | null;
}

export interface AttendanceLog {
  id: number;
  employee_id: number;
  employee_name: string;
  location_id: number | null;
  location_name: string | null;
  event_type: AttendanceEventType;
  event_time: string;
  source: AttendanceSource;
  camera_id: number | null;
  camera_name: string | null;
  created_at: string;
}

export interface AttendanceFilters {
  search?: string;
  status?: AttendanceStatus | "";
  from?: string;
  to?: string;
  location_id?: number;
  employee_id?: number;
}

export interface AttendanceDashboardStats {
  total_records: number;
  present: number;
  late: number;
  early_exit: number;
  overtime: number;
  avg_working_hours: number;
}

export interface DailyAttendanceTrend {
  attendance_date: string;
  present: number;
  late: number;
  overtime: number;
}

export interface MonthlyAttendanceTrend {
  month: string;
  present: number;
  late: number;
  overtime: number;
}
