"""Force AI recognition settings to motion+employee-only mode."""
import json

from db import db_cursor, load_recognition_settings


def main() -> int:
    with db_cursor() as (_, cur):
        current = load_recognition_settings(cur)
        current.update(
            {
                "continuousScanning": False,
                "storeUnknownFaces": False,
                "confidenceThreshold": max(
                    float(current.get("confidenceThreshold", 0.65)), 0.65
                ),
            }
        )

        cur.execute(
            """
            INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
            VALUES ('ai', 'recognition', %s::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (category, setting_key)
            DO UPDATE SET
              setting_value = EXCLUDED.setting_value,
              updated_at = CURRENT_TIMESTAMP
            """,
            (json.dumps(current),),
        )

    print("AI recognition set to motion-trigger + employee-only mode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
