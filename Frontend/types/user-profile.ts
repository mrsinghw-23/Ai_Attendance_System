export interface UserProfile {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  department: string | null;
  role: string;
  status: "ACTIVE" | "INACTIVE";
  employee_id: number | null;
  employee_name: string | null;
  employee_code: string | null;
  location_id: number | null;
  location_name: string | null;
  profile_image: string | null;
  last_login_at: string | null;
  password_changed_at: string | null;
  password_reset_required: boolean;
  created_at: string;
  updated_at: string | null;
}
