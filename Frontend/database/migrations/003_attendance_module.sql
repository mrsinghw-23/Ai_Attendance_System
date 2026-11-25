-- Phase 4: AI-ready Attendance Module
-- Camera -> Face Events -> Attendance Logs -> Attendance Records
-- Face recognition is intentionally not implemented yet.

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id),
  attendance_date DATE NOT NULL,
  check_in TIMESTAMP,
  check_out TIMESTAMP,
  working_hours NUMERIC(6,2) DEFAULT 0,
  overtime_hours NUMERIC(6,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'PRESENT',
  late_minutes INTEGER DEFAULT 0,
  early_exit_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(id),
  event_type VARCHAR(30) NOT NULL,
  event_time TIMESTAMP NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  camera_id INTEGER REFERENCES cameras(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_id ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_location_id ON attendance_records(location_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_id ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_location_id ON attendance_logs(location_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_event_time ON attendance_logs(event_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_camera_id ON attendance_logs(camera_id);

-- Backfill from the legacy attendance table if rows exist.
INSERT INTO attendance_records (
  employee_id,
  location_id,
  attendance_date,
  check_in,
  status,
  created_at
)
SELECT
  a.employee_id,
  e.location_id,
  a.attendance_date,
  a.check_in_time,
  COALESCE(UPPER(a.status), 'PRESENT'),
  COALESCE(a.created_at, CURRENT_TIMESTAMP)
FROM attendance a
JOIN employees e ON e.id = a.employee_id
WHERE a.employee_id IS NOT NULL
  AND a.attendance_date IS NOT NULL
ON CONFLICT (employee_id, attendance_date) DO NOTHING;
