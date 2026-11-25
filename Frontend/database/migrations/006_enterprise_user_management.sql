-- Phase 8: Enterprise User Management & Access Control

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
  ON password_reset_tokens(token);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS login_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(150),
  event_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL,
  ip_address VARCHAR(80),
  browser VARCHAR(120),
  device VARCHAR(120),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_event_type ON login_history(event_type);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at);

INSERT INTO roles (code, name, description, is_system) VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Full system access', TRUE),
  ('HR', 'HR', 'Human resources management', TRUE),
  ('MANAGER', 'Manager', 'Location and team management', TRUE),
  ('ATTENDANCE_ADMIN', 'Attendance Admin', 'Attendance operations', TRUE),
  ('CAMERA_ADMIN', 'Camera Admin', 'Camera and surveillance management', TRUE),
  ('EMPLOYEE', 'Employee', 'Self-service attendance', TRUE),
  ('VIEWER', 'Viewer', 'Read-only access', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (module, action, code, description) VALUES
  ('dashboard', 'view', 'dashboard.view', 'View dashboard'),
  ('employees', 'view', 'employees.view', 'View employees'),
  ('employees', 'create', 'employees.create', 'Create employees'),
  ('employees', 'edit', 'employees.edit', 'Edit employees'),
  ('employees', 'delete', 'employees.delete', 'Delete employees'),
  ('locations', 'view', 'locations.view', 'View locations'),
  ('locations', 'create', 'locations.create', 'Create locations'),
  ('locations', 'edit', 'locations.edit', 'Edit locations'),
  ('locations', 'delete', 'locations.delete', 'Delete locations'),
  ('cameras', 'view', 'cameras.view', 'View cameras'),
  ('cameras', 'create', 'cameras.create', 'Create cameras'),
  ('cameras', 'edit', 'cameras.edit', 'Edit cameras'),
  ('cameras', 'delete', 'cameras.delete', 'Delete cameras'),
  ('attendance', 'view', 'attendance.view', 'View attendance'),
  ('attendance', 'edit', 'attendance.edit', 'Edit attendance'),
  ('attendance', 'approve', 'attendance.approve', 'Approve attendance'),
  ('reports', 'view', 'reports.view', 'View reports'),
  ('reports', 'export', 'reports.export', 'Export reports'),
  ('users', 'view', 'users.view', 'View users'),
  ('users', 'create', 'users.create', 'Create users'),
  ('users', 'edit', 'users.edit', 'Edit users'),
  ('users', 'delete', 'users.delete', 'Delete users'),
  ('users', 'reset_password', 'users.reset_password', 'Reset user passwords'),
  ('settings', 'view', 'settings.view', 'View settings'),
  ('settings', 'edit', 'settings.edit', 'Edit settings'),
  ('notifications', 'view', 'notifications.view', 'View notifications'),
  ('notifications', 'manage', 'notifications.manage', 'Manage notifications'),
  ('audit_logs', 'view', 'audit_logs.view', 'View audit logs')
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- HR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
  'locations.view',
  'attendance.view',
  'reports.view', 'reports.export',
  'notifications.view'
)
WHERE r.code = 'HR'
ON CONFLICT DO NOTHING;

-- MANAGER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'employees.view', 'employees.edit',
  'cameras.view',
  'attendance.view', 'attendance.edit', 'attendance.approve',
  'reports.view', 'reports.export'
)
WHERE r.code = 'MANAGER'
ON CONFLICT DO NOTHING;

-- ATTENDANCE_ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'attendance.view', 'attendance.edit', 'attendance.approve',
  'reports.view', 'reports.export'
)
WHERE r.code = 'ATTENDANCE_ADMIN'
ON CONFLICT DO NOTHING;

-- CAMERA_ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'cameras.view', 'cameras.create', 'cameras.edit', 'cameras.delete',
  'locations.view'
)
WHERE r.code = 'CAMERA_ADMIN'
ON CONFLICT DO NOTHING;

-- EMPLOYEE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('attendance.view', 'attendance.edit')
WHERE r.code = 'EMPLOYEE'
ON CONFLICT DO NOTHING;

-- VIEWER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'employees.view',
  'locations.view',
  'cameras.view',
  'attendance.view',
  'reports.view'
)
WHERE r.code = 'VIEWER'
ON CONFLICT DO NOTHING;
