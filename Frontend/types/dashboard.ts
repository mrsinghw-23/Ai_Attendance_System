export interface DashboardOverview {
  employees: { total: number };
  attendance_today: {
    present: number;
    late: number;
    absent: number;
    half_day: number;
  };
  cameras: {
    total: number;
    online: number;
    offline: number;
    items: Array<{
      id: number;
      camera_name: string;
      health_status: string;
      location_name: string | null;
      location_id: number | null;
      camera_ip: string | null;
      port: number | null;
      rtsp_url: string | null;
      brand?: string | null;
      rtsp_channel?: number | null;
      rtsp_subtype?: number | null;
      last_diagnostics?: import("@/types/camera").CameraDiagnostics | null;
    }>;
  };
  locations: Array<{
    location_id: number;
    location_name: string;
    employee_count: number;
    present_today: number;
    attendance_rate: number;
  }>;
  weekly_trend: Array<{
    day: string;
    present: number;
    late: number;
  }>;
  monthly_breakdown: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  attendance_rate: number;
  recent_activity: Array<{
    title: string;
    source: string;
    time: string;
    tone: string;
  }>;
  primary_camera: {
    id: number;
    camera_name: string;
    location_name: string | null;
    location_id: number | null;
    health_status: string;
    camera_ip: string | null;
    port: number | null;
    rtsp_url: string | null;
    brand?: string | null;
    rtsp_channel?: number | null;
    rtsp_subtype?: number | null;
    last_diagnostics?: import("@/types/camera").CameraDiagnostics | null;
    reconnect_count?: number;
  } | null;
  face_registration: {
    registered: number;
    pending: number;
    partially_registered: number;
    registration_percentage: number;
  };
}

export type DashboardDetailType =
  | "total_employees"
  | "present"
  | "late"
  | "absent"
  | "half_day"
  | "cameras"
  | "users_all"
  | "users_active"
  | "users_disabled"
  | "faces_detected"
  | "faces_recognized"
  | "unknown_faces"
  | "attendance_generated"
  | "recent_activity"
  | "face_registered"
  | "face_pending"
  | "face_partial"
  | "locations_overview";

export interface DashboardEmployeeDetail {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  email: string | null;
  mobile: string | null;
  department: string | null;
  designation: string | null;
  location_name: string | null;
  employee_status: string;
  check_in: string | null;
  check_out: string | null;
  attendance_status: string;
  late_minutes: number;
  working_hours: number;
}

export interface DashboardCameraDetail {
  id: number;
  camera_name: string;
  camera_ip: string | null;
  location_name: string | null;
  health_status: string;
  status: string;
  last_seen: string | null;
}

export interface DashboardUserDetail {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  last_login_at: string | null;
}

export interface DashboardDetailResult {
  title: string;
  type: DashboardDetailType;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
}
