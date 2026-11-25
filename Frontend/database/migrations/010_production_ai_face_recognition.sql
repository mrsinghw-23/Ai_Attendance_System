-- Phase 12: Production AI Face Recognition

ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS source_image_id INTEGER REFERENCES employee_face_images(id) ON DELETE SET NULL;
ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS model_name VARCHAR(120);
ALTER TABLE face_embeddings ADD COLUMN IF NOT EXISTS dimensions INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_face_embeddings_source_image
  ON face_embeddings(source_image_id) WHERE source_image_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS unknown_faces (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  image_path TEXT NOT NULL,
  confidence NUMERIC(6,3),
  metadata JSONB DEFAULT '{}'::jsonb,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unknown_faces_camera_id ON unknown_faces(camera_id);
CREATE INDEX IF NOT EXISTS idx_unknown_faces_detected_at ON unknown_faces(detected_at);
CREATE INDEX IF NOT EXISTS idx_unknown_faces_location_id ON unknown_faces(location_id);

CREATE TABLE IF NOT EXISTS ai_recognition_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  faces_detected INTEGER DEFAULT 0,
  faces_recognized INTEGER DEFAULT 0,
  unknown_faces INTEGER DEFAULT 0,
  attendance_generated INTEGER DEFAULT 0,
  active_cameras INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stat_date)
);

CREATE TABLE IF NOT EXISTS ai_recognition_events (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_recognition_events_created_at ON ai_recognition_events(created_at);

INSERT INTO system_settings (category, setting_key, setting_value)
VALUES (
  'ai',
  'recognition',
  '{
    "confidenceThreshold": 0.65,
    "motionSensitivity": 25,
    "frameSamplingIntervalMs": 500,
    "embeddingModel": "buffalo_l",
    "embeddingSyncIntervalMinutes": 30,
    "unknownFaceCooldownSeconds": 60,
    "recognitionCooldownSeconds": 30
  }'::jsonb
)
ON CONFLICT (category, setting_key) DO NOTHING;

COMMENT ON TABLE unknown_faces IS 'Unrecognized faces captured from live camera streams';
COMMENT ON TABLE ai_recognition_stats IS 'Daily AI recognition counters for dashboard widgets';
