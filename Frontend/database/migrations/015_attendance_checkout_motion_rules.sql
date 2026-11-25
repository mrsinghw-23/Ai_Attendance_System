-- Checkout cutoff at 5:55 PM (17:55), configurable via attendance.rules.shiftEnd

INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
VALUES (
  'attendance',
  'rules',
  '{"shiftStart":"09:55","shiftEnd":"17:55","lateGraceMinutes":5,"standardWorkHours":8}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT (category, setting_key)
DO UPDATE SET
  setting_value = system_settings.setting_value || '{"shiftEnd":"17:55"}'::jsonb,
  updated_at = CURRENT_TIMESTAMP;

UPDATE system_settings
SET setting_value = COALESCE(setting_value, '{}'::jsonb) || '{"checkOutAfterHour":17,"checkOutAfterMinute":55}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'attendance' AND setting_key = 'engine';

UPDATE system_settings
SET setting_value = COALESCE(setting_value, '{}'::jsonb) || '{"continuousScanning":false}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'ai' AND setting_key = 'recognition';
