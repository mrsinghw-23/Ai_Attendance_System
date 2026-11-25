import json
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any

import psycopg2
import psycopg2.extras

from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DEFAULT_SETTINGS


def get_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield conn, cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_daily_stats_row(cur) -> None:
    cur.execute(
        """
        INSERT INTO ai_recognition_stats (stat_date)
        VALUES (CURRENT_DATE)
        ON CONFLICT (stat_date) DO NOTHING
        """
    )


def increment_stat(cur, field: str, amount: int = 1) -> None:
    ensure_daily_stats_row(cur)
    cur.execute(
        f"""
        UPDATE ai_recognition_stats
        SET {field} = {field} + %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE stat_date = CURRENT_DATE
        """,
        (amount,),
    )


def set_active_cameras(cur, count: int) -> None:
    ensure_daily_stats_row(cur)
    cur.execute(
        """
        UPDATE ai_recognition_stats
        SET active_cameras = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE stat_date = CURRENT_DATE
        """,
        (count,),
    )


def load_recognition_settings(cur) -> dict[str, Any]:
    cur.execute(
        """
        SELECT setting_value
        FROM system_settings
        WHERE category = 'ai' AND setting_key = 'recognition'
        """
    )
    row = cur.fetchone()
    if not row or not row.get("setting_value"):
        return dict(DEFAULT_SETTINGS)

    value = row["setting_value"]
    if isinstance(value, str):
        value = json.loads(value)

    merged = dict(DEFAULT_SETTINGS)
    merged.update(value)
    return merged


def load_active_cameras(cur, camera_id: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT
            c.id,
            c.camera_name,
            c.camera_ip,
            c.http_port,
            c.port,
            c.rtsp_channel,
            c.rtsp_subtype,
            c.rtsp_url,
            c.rtsp_username,
            c.rtsp_password_enc,
            c.brand,
            c.firmware,
            c.onvif_version,
            c.location_id,
            c.motion_enabled,
            c.motion_sensitivity,
            l.location_name
        FROM cameras c
        LEFT JOIN locations l ON l.id = c.location_id
        WHERE COALESCE(c.status, 'ACTIVE') = 'ACTIVE'
    """
    params: tuple[Any, ...] = ()
    if camera_id:
        query += " AND c.id = %s"
        params = (camera_id,)

    cur.execute(query, params)
    return list(cur.fetchall())


def load_employee_embeddings(cur) -> list[dict[str, Any]]:
    """Load every active employee face embedding — no location or profile filter."""
    cur.execute(
        """
        SELECT
            fe.id,
            fe.employee_id,
            fe.embedding_data,
            fe.model_name,
            e.employee_code,
            TRIM(CONCAT(
                COALESCE(e.first_name, SPLIT_PART(e.name, ' ', 1), ''),
                ' ',
                COALESCE(e.last_name, '')
            )) AS employee_name
        FROM face_embeddings fe
        JOIN employees e ON e.id = fe.employee_id
        WHERE fe.embedding_data IS NOT NULL
          AND fe.embedding_data <> ''
          AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
          AND EXISTS (
            SELECT 1
            FROM employee_face_images efi
            WHERE efi.employee_id = e.id
          )
        ORDER BY fe.employee_id, fe.id
        """
    )
    rows = cur.fetchall()
    for row in rows:
        row["vector"] = json.loads(row["embedding_data"])
    return rows


def load_registration_images(cur, employee_id: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT
            efi.id AS source_image_id,
            efi.employee_id,
            efi.face_profile_id,
            efi.image_path,
            efi.image_type
        FROM employee_face_images efi
        JOIN employee_face_profiles efp ON efp.id = efi.face_profile_id
        JOIN employees e ON e.id = efi.employee_id
        WHERE COALESCE(efp.active, TRUE) = TRUE
          AND COALESCE(e.status, 'ACTIVE') = 'ACTIVE'
    """
    params: tuple[Any, ...] = ()
    if employee_id:
        query += " AND efi.employee_id = %s"
        params = (employee_id,)
    query += " ORDER BY efi.employee_id, efi.id"

    cur.execute(query, params)
    return list(cur.fetchall())


def upsert_embedding(
    cur,
    *,
    employee_id: int,
    face_profile_id: int | None,
    source_image_id: int,
    embedding_data: str,
    model_name: str,
    dimensions: int,
) -> str:
    cur.execute(
        """
        SELECT id FROM face_embeddings WHERE source_image_id = %s
        """,
        (source_image_id,),
    )
    existing = cur.fetchone()

    if existing:
        cur.execute(
            """
            UPDATE face_embeddings
            SET embedding_data = %s,
                model_name = %s,
                dimensions = %s,
                embedding_version = 'v1',
                generated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (embedding_data, model_name, dimensions, existing["id"]),
        )
        return "updated"

    cur.execute(
        """
        INSERT INTO face_embeddings (
            employee_id,
            face_profile_id,
            source_image_id,
            embedding_data,
            model_name,
            dimensions,
            embedding_version,
            generated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, 'v1', CURRENT_TIMESTAMP)
        """,
        (
            employee_id,
            face_profile_id,
            source_image_id,
            embedding_data,
            model_name,
            dimensions,
        ),
    )
    return "created"


def insert_face_event(
    cur,
    *,
    camera_id: int | None,
    employee_id: int | None,
    location_id: int | None,
    event_time: datetime,
    confidence: float | None,
    event_type: str,
    image_ref: str | None = None,
    metadata: dict | None = None,
) -> int:
    cur.execute(
        """
        INSERT INTO face_events (
            camera_id,
            employee_id,
            location_id,
            event_time,
            confidence,
            event_type,
            image_ref,
            metadata,
            processed
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, FALSE)
        RETURNING id
        """,
        (
            camera_id,
            employee_id,
            location_id,
            event_time,
            confidence,
            event_type,
            image_ref,
            json.dumps(metadata or {}),
        ),
    )
    return int(cur.fetchone()["id"])


def insert_unknown_face(
    cur,
    *,
    camera_id: int | None,
    location_id: int | None,
    image_path: str,
    confidence: float | None,
    metadata: dict | None = None,
) -> int:
    cur.execute(
        """
        INSERT INTO unknown_faces (
            camera_id,
            location_id,
            image_path,
            confidence,
            metadata
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            camera_id,
            location_id,
            image_path,
            confidence,
            json.dumps(metadata or {}),
        ),
    )
    row = cur.fetchone()
    increment_stat(cur, "unknown_faces")
    increment_stat(cur, "faces_detected")
    return int(row["id"]) if row and row.get("id") is not None else 0


def log_recognition_event(cur, camera_id: int | None, event_type: str, message: str, metadata: dict | None = None) -> None:
    cur.execute(
        """
        INSERT INTO ai_recognition_events (camera_id, event_type, message, metadata)
        VALUES (%s, %s, %s, %s)
        """,
        (camera_id, event_type, message, json.dumps(metadata or {})),
    )


def increment_reconnect_count(cur, camera_id: int) -> None:
    cur.execute(
        """
        UPDATE cameras
        SET reconnect_count = COALESCE(reconnect_count, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (camera_id,),
    )


def update_camera_runtime(cur, camera_id: int, stats: dict[str, Any]) -> None:
    cur.execute(
        """
        UPDATE cameras
        SET
          last_diagnostics = COALESCE(last_diagnostics, '{}'::jsonb) || %s::jsonb,
          last_seen = CURRENT_TIMESTAMP,
          health_status = CASE
            WHEN %s::jsonb->>'ai_status' = 'STREAMING' THEN 'ONLINE'
            ELSE health_status
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (json.dumps(stats), json.dumps(stats), camera_id),
    )
