export interface Location {
  id: number;
  location_name: string;
  city: string | null;
  state: string | null;
  created_at: string;
}

export interface LocationWithStats extends Location {
  employee_count: number;
  camera_count: number;
}

export interface LocationFormData {
  location_name: string;
  city?: string;
  state?: string;
}
