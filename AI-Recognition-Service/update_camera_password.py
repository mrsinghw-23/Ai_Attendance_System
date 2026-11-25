"""Update camera RTSP username/password with encrypted password in DB.

Usage:
  python update_camera_password.py --camera-id 13 --username admin --password "User22--"
"""
import argparse

from crypto_util import encrypt_secret
from db import db_cursor


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Update camera RTSP credentials for AI scanner"
    )
    parser.add_argument("--camera-id", type=int, required=True)
    parser.add_argument("--username", type=str, default="")
    parser.add_argument("--password", type=str, required=True)
    args = parser.parse_args()

    enc = encrypt_secret(args.password)
    with db_cursor() as (_, cur):
        cur.execute(
            """
            UPDATE cameras
            SET
              rtsp_username = CASE
                WHEN %s = '' THEN rtsp_username
                ELSE %s
              END,
              rtsp_password_enc = %s,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (args.username, args.username, enc, args.camera_id),
        )
        if cur.rowcount == 0:
            print(f"Camera not found: {args.camera_id}")
            return 1

    print(f"Updated RTSP password for camera {args.camera_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
