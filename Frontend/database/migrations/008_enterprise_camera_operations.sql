-- Phase 10: Enterprise Camera Management & AI Camera Operations

CREATE TABLE IF NOT EXISTS camera_zones (
  id SERIAL PRIMARY KEY,
  zone_name VARCHAR(150) NOT NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  description TEXT,
  floor VARCHAR(50),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_camera_zones_location ON camera_zones(location_id);
CREATE INDEX IF NOT EXISTS idx_camera_zones_status ON camera_zones(status);

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS camera_code VARCHAR(50);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS camera_type VARCHAR(50);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS port INTEGER;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS rtsp_username VARCHAR(150);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS rtsp_password_enc TEXT;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES camera_zones(id) ON DELETE SET NULL;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS floor VARCHAR(50);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS entry_exit_type VARCHAR(20) DEFAULT 'NONE';
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS installation_date DATE;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS warranty_date DATE;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS motion_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS motion_sensitivity INTEGER DEFAULT 50;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_motion_detected TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cameras_camera_code
  ON cameras(camera_code) WHERE camera_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cameras_zone_id ON cameras(zone_id);
CREATE INDEX IF NOT EXISTS idx_cameras_entry_exit ON cameras(entry_exit_type);

ALTER TABLE camera_health_logs ADD COLUMN IF NOT EXISTS camera_reachable BOOLEAN DEFAULT FALSE;
ALTER TABLE camera_health_logs ADD COLUMN IF NOT EXISTS rtsp_reachable BOOLEAN DEFAULT FALSE;
ALTER TABLE camera_health_logs ADD COLUMN IF NOT EXISTS stream_available BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS camera_events (
  id SERIAL PRIMARY KEY,
  camera_id INTEGER NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_camera_events_camera_id ON camera_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_events_type ON camera_events(event_type);
CREATE INDEX IF NOT EXISTS idx_camera_events_created_at ON camera_events(created_at);

-- Default zone templates (unassigned to location; assign via UI)
INSERT INTO camera_zones (zone_name, description, status)
SELECT v.zone_name, v.description, 'ACTIVE'
FROM (
  VALUES
    ('Main Gate', 'Main entrance gate area'),
    ('Reception', 'Reception and lobby area'),
    ('Office Floor', 'General office floor monitoring'),
    ('Production Area', 'Production and shop floor'),
    ('Exit Gate', 'Exit gate and outbound area'),
    ('Parking Area', 'Parking and vehicle area')
) AS v(zone_name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM camera_zones cz WHERE LOWER(cz.zone_name) = LOWER(v.zone_name)
);

COMMENT ON TABLE camera_zones IS 'Physical zones within locations for camera grouping';
COMMENT ON TABLE camera_events IS 'Camera operational events: motion, offline, stream errors, AI links';
COMMENT ON COLUMN cameras.rtsp_password_enc IS 'AES-256-GCM encrypted RTSP password; never store plain text';
