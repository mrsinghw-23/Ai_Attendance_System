import { UserRole } from "@/types/roles";

export type UserStatus = "ACTIVE" | "INACTIVE";

export interface UserAccount {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  department: string | null;
  role: UserRole;
  status: UserStatus;
  employee_id: number | null;
  employee_name: string | null;
  location_id: number | null;
  location_name: string | null;
  last_login_at: string | null;
  password_changed_at: string | null;
  password_reset_required: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface UserStats {
  total_users: number;
  active_users: number;
  disabled_users: number;
  recent_logins: LoginHistoryEntry[];
  recent_password_resets: LoginHistoryEntry[];
}

export interface LoginHistoryEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  event_type: string;
  status: string;
  ip_address: string | null;
  browser: string | null;
  device: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PermissionRecord {
  id: number;
  module: string;
  action: string;
  code: string;
  description: string | null;
}

export interface RoleRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  permissions: PermissionRecord[];
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SystemSetting {
  id: number;
  category: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}
