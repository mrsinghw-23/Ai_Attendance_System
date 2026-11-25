-- Extend cameras table for production Camera Module + future AI face-recognition pipeline
-- Safe to re-run (IF NOT EXISTS)
--
-- FUTURE AI ARCHITECTURE (not created here, documented for forward-compatibility):
--   cameras (this table)
--     -> face_events        (camera_id FK, detected face bbox/embedding ref, ts)
--     -> attendance_logs    (raw recognition hits per employee per camera)
--     -> attendance         (resolved check-in/out records)
--   camera_health_logs      (camera_id FK, health pings over time)
--   camera_streams          (camera_id FK, stream/session metadata)

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS rtsp_url TEXT;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'UNKNOWN';
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS recording_status VARCHAR(20) DEFAULT 'NOT_RECORDING';
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Normalize legacy status values (e.g. 'Active' -> 'ACTIVE')
UPDATE cameras SET status = UPPER(status) WHERE status IS NOT NULL;
UPDATE cameras SET status = 'ACTIVE' WHERE status IS NULL;
ALTER TABLE cameras ALTER COLUMN status SET DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_cameras_location_id ON cameras(location_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON cameras(status);
CREATE INDEX IF NOT EXISTS idx_cameras_health_status ON cameras(health_status);
