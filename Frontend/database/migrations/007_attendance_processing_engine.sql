-- Phase 9: AI Attendance Processing Engine
-- Processes face_events into attendance records, presence logs, and summaries.

CREATE TABLE IF NOT EXISTS employee_presence_logs (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('IN', 'OUT')),
  event_time TIMESTAMP NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'AI_FACE_RECOGNITION',
  face_event_id INTEGER REFERENCES face_events(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_presence_logs_employee_id ON employee_presence_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_presence_logs_event_time ON employee_presence_logs(event_time);
CREATE INDEX IF NOT EXISTS idx_presence_logs_employee_date ON employee_presence_logs(employee_id, event_time);

CREATE TABLE IF NOT EXISTS attendance_summary (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in TIMESTAMP,
  check_out TIMESTAMP,
  working_hours NUMERIC(6,2) DEFAULT 0,
  total_inside_minutes INTEGER DEFAULT 0,
  total_outside_minutes INTEGER DEFAULT 0,
  working_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  outside_duration INTEGER DEFAULT 0,
  entries INTEGER DEFAULT 0,
  exits INTEGER DEFAULT 0,
  attendance_status VARCHAR(20) DEFAULT 'ABSENT',
  late_minutes INTEGER DEFAULT 0,
  location_id INTEGER REFERENCES locations(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_date ON attendance_summary(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_status ON attendance_summary(attendance_status);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_employee_id ON attendance_summary(employee_id);

CREATE TABLE IF NOT EXISTS attendance_engine_runs (
  id SERIAL PRIMARY KEY,
  run_type VARCHAR(40) NOT NULL DEFAULT 'PROCESS_FACE_EVENTS',
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  events_processed INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  summaries_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_engine_runs_started ON attendance_engine_runs(started_at);

CREATE TABLE IF NOT EXISTS employee_presence_state (
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  is_inside BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMP,
  last_camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
  last_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  check_in_set BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (employee_id, attendance_date)
);

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS total_inside_minutes INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS total_outside_minutes INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS working_minutes INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS entries INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS exits INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20);

INSERT INTO system_settings (category, setting_key, setting_value)
VALUES
  ('attendance', 'engine', '{
    "onTimeStartHour": 9,
    "onTimeStartMinute": 55,
    "onTimeEndHour": 10,
    "onTimeEndMinute": 0,
    "checkOutAfterHour": 19,
    "checkOutAfterMinute": 0,
    "presenceGapMinutes": 30,
    "halfDayCutoffHour": 15,
    "halfDayCutoffMinute": 0,
    "standardWorkHours": 8,
    "minConfidence": 0.5
  }'),
  ('integration', 'future_ready', '{
    "payrollEnabled": false,
    "hrmsEnabled": false,
    "mobileAppEnabled": false,
    "multiBranchEnabled": true,
    "visitorManagementEnabled": false,
    "faceRegistrationEnabled": true,
    "aiAnalyticsEnabled": true,
    "realTimeAlertsEnabled": true
  }')
ON CONFLICT (category, setting_key) DO NOTHING;
