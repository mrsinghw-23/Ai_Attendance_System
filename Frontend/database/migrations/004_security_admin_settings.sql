-- Phase 5: Security, Administration, Settings, Audit

ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE users SET status = 'ACTIVE' WHERE status IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(150),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80),
  entity_id VARCHAR(80),
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(80),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(80) NOT NULL,
  setting_key VARCHAR(120) NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, setting_key)
);

INSERT INTO system_settings (category, setting_key, setting_value)
VALUES
  ('company', 'profile', '{"companyName":"AI Attendance System","timezone":"Asia/Kolkata","locale":"en-IN"}'),
  ('attendance', 'rules', '{"shiftStart":"09:00","shiftEnd":"18:00","lateGraceMinutes":15,"standardWorkHours":8}'),
  ('camera', 'defaults', '{"healthCheckIntervalSeconds":60,"recordingRetentionDays":30,"rtspTimeoutSeconds":10}'),
  ('notification', 'preferences', '{"emailAlerts":false,"cameraOfflineAlerts":true,"lateArrivalAlerts":true}'),
  ('branding', 'theme', '{"primaryColor":"#2563eb","logoUrl":"","darkModeDefault":false}')
ON CONFLICT (category, setting_key) DO NOTHING;
