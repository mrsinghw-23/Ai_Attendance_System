export type FaceImageType =
  | "FRONT"
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "DOWN"
  | "ADDITIONAL";

export type FaceProfileStatus =
  | "NOT_REGISTERED"
  | "PARTIALLY_REGISTERED"
  | "FULLY_REGISTERED";

export interface FaceQualityMetrics {
  width: number;
  height: number;
  brightness: number;
  blurScore: number;
  faceVisible: boolean;
  faceSizeOk: boolean;
  multipleFacesSuspected: boolean;
}

export interface FaceQualityResult {
  passed: boolean;
  score: number;
  issues: string[];
  metrics: FaceQualityMetrics;
}

export interface EmployeeFaceImage {
  id: number;
  employee_id: number;
  face_profile_id: number;
  image_path: string;
  image_type: FaceImageType;
  quality_score: number;
  quality_metadata: Record<string, unknown>;
  created_at: string;
}

export interface EmployeeFaceProfile {
  id: number;
  employee_id: number;
  profile_status: FaceProfileStatus;
  registration_date: string | null;
  image_count: number;
  active: boolean;
  required_count: number;
  recommended_count: number;
  images: EmployeeFaceImage[];
  created_at: string;
  updated_at: string | null;
  ai_scannable?: boolean;
  ai_readiness?: "NO_FACE" | "PARTIAL" | "SYNC_PENDING" | "AI_READY";
  embedding_count?: number;
}

export interface FaceRegistrationStats {
  total_employees: number;
  registered: number;
  partially_registered: number;
  pending: number;
  registration_percentage: number;
}

export const REQUIRED_FACE_TYPES: FaceImageType[] = [
  "FRONT",
  "LEFT",
  "RIGHT",
  "UP",
];

export const MIN_FACE_SAMPLES = 4;
export const RECOMMENDED_FACE_SAMPLES = 10;
