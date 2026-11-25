-- Live CCTV integration: HTTP port, RTSP channel/subtype, diagnostics metadata

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS http_port INTEGER DEFAULT 80;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS rtsp_channel INTEGER DEFAULT 1;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS rtsp_subtype INTEGER DEFAULT 0;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS firmware VARCHAR(120);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS onvif_version VARCHAR(50);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_diagnostics JSONB DEFAULT '{}'::jsonb;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS reconnect_count INTEGER DEFAULT 0;

ALTER TABLE camera_health_logs ADD COLUMN IF NOT EXISTS diagnostics JSONB DEFAULT '{}'::jsonb;
