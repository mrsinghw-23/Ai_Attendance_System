-- Phase 15.1: Live Face Registration

CREATE TABLE IF NOT EXISTS face_registration_audit_log (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  face_profile_id INTEGER REFERENCES employee_face_profiles(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  image_type VARCHAR(30),
  quality_score NUMERIC(6,3),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_face_reg_audit_employee ON face_registration_audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_face_reg_audit_session ON face_registration_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_face_reg_audit_created ON face_registration_audit_log(created_at);

COMMENT ON TABLE face_registration_audit_log IS 'Audit trail for manual and live face registration sessions';
