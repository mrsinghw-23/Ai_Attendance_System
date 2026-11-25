-- Align attendance engine with shift rules: check-in from 09:55, check-out from 18:55

INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
VALUES (
  'attendance',
  'rules',
  '{"shiftStart":"09:55","shiftEnd":"18:55","lateGraceMinutes":5,"standardWorkHours":8}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT (category, setting_key)
DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = CURRENT_TIMESTAMP;

UPDATE system_settings
SET setting_value = COALESCE(setting_value, '{}'::jsonb) || '{"checkOutAfterHour":18,"checkOutAfterMinute":55,"onTimeStartHour":9,"onTimeStartMinute":55,"onTimeEndHour":10,"onTimeEndMinute":0,"minConfidence":0.65}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'attendance' AND setting_key = 'engine';
