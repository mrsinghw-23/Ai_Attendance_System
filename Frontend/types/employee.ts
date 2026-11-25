export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE";

export type FaceRegistrationStatus =
  | "NOT_REGISTERED"
  | "PENDING"
  | "REGISTERED";

export interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  mobile: string | null;
  designation: string | null;
  department: string | null;
  location_id: number | null;
  location_name: string | null;
  location_city: string | null;
  reporting_manager_id: number | null;
  reporting_manager_name: string | null;
  status: EmployeeStatus;
  joining_date: string | null;
  photo_url: string | null;
  face_registration_status: FaceRegistrationStatus;
  face_image_count?: number;
  face_embedding_count?: number;
  ai_scannable?: boolean;
  ai_readiness?: "NO_FACE" | "PARTIAL" | "SYNC_PENDING" | "AI_READY";
  created_at: string;
  updated_at: string | null;
}

export interface EmployeeListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeStatus | "";
  department?: string;
  location_id?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EmployeeFormData {
  employee_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  mobile?: string;
  designation?: string;
  department?: string;
  location_id?: number | null;
  reporting_manager_id?: number | null;
  status: EmployeeStatus;
  joining_date?: string;
  photo_url?: string;
  face_registration_status?: FaceRegistrationStatus;
}
