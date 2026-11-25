import pool from "@/lib/db";
import { SystemSetting } from "@/types/admin";

export async function getSettings() {
  const result = await pool.query(
    `
    SELECT *
    FROM system_settings
    ORDER BY category, setting_key
    `
  );

  return result.rows as SystemSetting[];
}

export async function getSettingsGrouped() {
  const rows = await getSettings();

  return rows.reduce<Record<string, Record<string, unknown>>>(
    (grouped, row) => {
      grouped[row.category] ||= {};
      grouped[row.category][row.setting_key] = row.setting_value;
      return grouped;
    },
    {}
  );
}

export async function updateSettings(
  settings: Record<string, Record<string, unknown>>,
  userId: number
) {
  for (const [category, values] of Object.entries(settings)) {
    for (const [settingKey, settingValue] of Object.entries(values)) {
      await pool.query(
        `
        INSERT INTO system_settings (
          category,
          setting_key,
          setting_value,
          updated_by,
          updated_at
        )
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (category, setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [category, settingKey, JSON.stringify(settingValue), userId]
      );
    }
  }

  return getSettingsGrouped();
}
