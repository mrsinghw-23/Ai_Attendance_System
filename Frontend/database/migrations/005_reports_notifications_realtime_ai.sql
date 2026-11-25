-- Phase 6: Reports, Notifications, Real-Time and AI readiness.
-- Additive schema only. Actual face recognition is intentionally not implemented.

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50),
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'SYSTEM',
  priority VARCHAR(20) DEFAULT 'NORMAL',
  read_at TIMESTAMP,
  entity_type VARCHAR(80),
  entity_id VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE TABLE IF NOT EXISTS camera_health_logs (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  health_status VARCHAR(20) NOT NULL,
  latency_ms INTEGER,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_camera_health_logs_camera_id ON camera_health_logs(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_health_logs_checked_at ON camera_health_logs(checked_at);

CREATE TABLE IF NOT EXISTS employee_face_profiles (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  profile_status VARCHAR(30) DEFAULT 'PENDING',
  image_count INTEGER DEFAULT 0,
  embedding_model VARCHAR(120),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_face_profiles_employee_id ON employee_face_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_face_profiles_status ON employee_face_profiles(profile_status);

CREATE TABLE IF NOT EXISTS face_embeddings_metadata (
  id SERIAL PRIMARY KEY,
  face_profile_id INTEGER NOT NULL REFERENCES employee_face_profiles(id) ON DELETE CASCADE,
  embedding_ref TEXT NOT NULL,
  model_name VARCHAR(120),
  vector_dimensions INTEGER,
  quality_score NUMERIC(6,3),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_profile_id ON face_embeddings_metadata(face_profile_id);

CREATE TABLE IF NOT EXISTS face_events (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  event_time TIMESTAMP NOT NULL,
  confidence NUMERIC(6,3),
  event_type VARCHAR(50) DEFAULT 'FACE_DETECTED',
  image_ref TEXT,
  embedding_ref TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  processed BOOLEAN DEFAULT FALSE,
  attendance_log_id INTEGER REFERENCES attendance_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_face_events_camera_id ON face_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_face_events_employee_id ON face_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_face_events_event_time ON face_events(event_time);
CREATE INDEX IF NOT EXISTS idx_face_events_processed ON face_events(processed);
