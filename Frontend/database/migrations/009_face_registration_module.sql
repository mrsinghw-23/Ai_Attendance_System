-- Phase 11: Face Registration Module

ALTER TABLE employee_face_profiles ADD COLUMN IF NOT EXISTS registration_date DATE;
ALTER TABLE employee_face_profiles ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS employee_face_images (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  face_profile_id INTEGER NOT NULL REFERENCES employee_face_profiles(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  image_type VARCHAR(30) NOT NULL,
  quality_score NUMERIC(6,3) DEFAULT 0,
  quality_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_face_images_employee_id ON employee_face_images(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_face_images_profile_id ON employee_face_images(face_profile_id);
CREATE INDEX IF NOT EXISTS idx_employee_face_images_type ON employee_face_images(image_type);

CREATE TABLE IF NOT EXISTS face_embeddings (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  face_profile_id INTEGER REFERENCES employee_face_profiles(id) ON DELETE CASCADE,
  embedding_version VARCHAR(50) DEFAULT 'v1',
  embedding_data TEXT,
  generated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_employee_id ON face_embeddings(employee_id);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_profile_id ON face_embeddings(face_profile_id);

INSERT INTO permissions (module, action, code, description)
SELECT v.module, v.action, v.code, v.description
FROM (
  VALUES
    ('face_registration', 'view', 'face_registration.view', 'View face registration profiles'),
    ('face_registration', 'manage', 'face_registration.manage', 'Manage face registration uploads')
) AS v(module, action, code, description)
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.code = v.code
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('face_registration.view', 'face_registration.manage')
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('face_registration.view', 'face_registration.manage')
WHERE r.code = 'HR'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'face_registration.view'
WHERE r.code = 'MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMENT ON TABLE face_embeddings IS 'Architecture-ready storage for future embedding generation; not populated yet';
