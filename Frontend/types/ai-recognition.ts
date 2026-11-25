export interface AIRecognitionSettings {
  confidenceThreshold: number;
  motionSensitivity: number;
  frameSamplingIntervalMs: number;
  embeddingModel: string;
  embeddingSyncIntervalMinutes: number;
  unknownFaceCooldownSeconds: number;
  recognitionCooldownSeconds: number;
  continuousScanning?: boolean;
  storeUnknownFaces?: boolean;
}

export interface AIRecognitionDashboard {
  faces_detected: number;
  faces_detected_total?: number;
  faces_recognized: number;
  faces_recognized_total?: number;
  unknown_faces: number;
  attendance_generated: number;
  active_cameras: number;
  total_cameras: number;
  embeddings_count: number;
  registered_employees: number;
  recent_unknown: UnknownFaceRecord[];
  recent_recognitions: Array<{
    id: number;
    employee_name: string | null;
    camera_name: string | null;
    confidence: number | null;
    event_time: string;
  }>;
}

export interface UnknownFaceRecord {
  id: number;
  camera_id: number | null;
  camera_name: string | null;
  location_id: number | null;
  location_name: string | null;
  image_path: string;
  confidence: number | null;
  detected_at: string;
}

export interface EmbeddingSyncResult {
  images_processed: number;
  embeddings_created: number;
  embeddings_updated: number;
  employees_covered: number;
  model_name: string;
}
