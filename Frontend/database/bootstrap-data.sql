\set ON_ERROR_STOP on

BEGIN;

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
  ('audit_logs', 'view', 'audit_logs.view', 'View audit logs'),
  ('face_registration', 'view', 'face_registration.view', 'View face registration profiles'),
  ('face_registration', 'manage', 'face_registration.manage', 'Manage face registration uploads')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
  'locations.view',
  'attendance.view',
  'reports.view', 'reports.export',
  'notifications.view',
  'face_registration.view', 'face_registration.manage'
)
WHERE r.code = 'HR'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view',
  'employees.view', 'employees.edit',
  'cameras.view',
  'attendance.view', 'attendance.edit', 'attendance.approve',
  'reports.view', 'reports.export',
  'face_registration.view'
)
WHERE r.code = 'MANAGER'
ON CONFLICT DO NOTHING;

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

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('attendance.view', 'attendance.edit')
WHERE r.code = 'EMPLOYEE'
ON CONFLICT DO NOTHING;

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
  SELECT 1
  FROM camera_zones cz
  WHERE LOWER(cz.zone_name) = LOWER(v.zone_name)
);

INSERT INTO system_settings (category, setting_key, setting_value) VALUES
  (
    'company',
    'profile',
    '{"companyName":"AI Attendance System","timezone":"Asia/Kolkata","locale":"en-IN"}'
  ),
  (
    'attendance',
    'rules',
    '{"shiftStart":"09:55","shiftEnd":"17:55","lateGraceMinutes":5,"standardWorkHours":8}'
  ),
  (
    'camera',
    'defaults',
    '{"healthCheckIntervalSeconds":60,"recordingRetentionDays":30,"rtspTimeoutSeconds":10}'
  ),
  (
    'notification',
    'preferences',
    '{"emailAlerts":false,"cameraOfflineAlerts":true,"lateArrivalAlerts":true}'
  ),
  (
    'branding',
    'theme',
    '{"primaryColor":"#2563eb","logoUrl":"","darkModeDefault":false}'
  ),
  (
    'attendance',
    'engine',
    '{
      "onTimeStartHour":9,
      "onTimeStartMinute":55,
      "onTimeEndHour":10,
      "onTimeEndMinute":0,
      "checkOutAfterHour":17,
      "checkOutAfterMinute":55,
      "presenceGapMinutes":30,
      "halfDayCutoffHour":15,
      "halfDayCutoffMinute":0,
      "standardWorkHours":8,
      "minConfidence":0.5
    }'
  ),
  (
    'integration',
    'future_ready',
    '{
      "payrollEnabled":false,
      "hrmsEnabled":false,
      "mobileAppEnabled":false,
      "multiBranchEnabled":true,
      "visitorManagementEnabled":false,
      "faceRegistrationEnabled":true,
      "aiAnalyticsEnabled":true,
      "realTimeAlertsEnabled":true
    }'
  ),
  (
    'ai',
    'recognition',
    '{
      "confidenceThreshold":0.65,
      "motionSensitivity":25,
      "frameSamplingIntervalMs":500,
      "embeddingModel":"buffalo_l",
      "embeddingSyncIntervalMinutes":30,
      "unknownFaceCooldownSeconds":60,
      "recognitionCooldownSeconds":30,
      "continuousScanning":false
    }'
  )
ON CONFLICT (category, setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;
