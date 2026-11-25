"""Capture a single JPEG frame from an IP/RTSP camera."""

from __future__ import annotations

import json
import sys

import cv2

from db import db_cursor
from stream_util import capture_camera_frame


def load_camera(cur, camera_id: int) -> dict | None:
    cur.execute(
        """
        SELECT
            c.id, c.camera_name, c.camera_ip, c.http_port, c.port,
            c.rtsp_channel, c.rtsp_subtype, c.rtsp_url,
            c.rtsp_username, c.rtsp_password_enc, c.brand
        FROM cameras c
        WHERE c.id = %s
        """,
        (camera_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def encode_frame_jpeg(frame, *, preview: bool = False) -> bytes | None:
    output = frame
    if preview:
        height, width = frame.shape[:2]
        max_width = 1280
        if width > max_width:
            scale = max_width / width
            output = cv2.resize(
                frame,
                (int(width * scale), int(height * scale)),
                interpolation=cv2.INTER_AREA,
            )
        quality = 72
    else:
        quality = 92

    success, encoded = cv2.imencode(".jpg", output, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return None
    return encoded.tobytes()


def capture_camera_frame_jpeg(camera_id: int, preview: bool = False) -> bytes | None:
    with db_cursor() as (_conn, cur):
        camera = load_camera(cur, camera_id)

    if not camera:
        return None

    capture_camera = dict(camera)
    if not preview:
        capture_camera["rtsp_subtype"] = 0
        capture_camera["onvif_profile_token"] = "Profile000"

    frame, _meta = capture_camera_frame(capture_camera)
    if frame is None:
        return None

    return encode_frame_jpeg(frame, preview=preview)


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "camera_id required"}))
        return 1

    camera_id = int(sys.argv[1])
    preview = "--preview" in sys.argv[2:]
    frame = capture_camera_frame_jpeg(camera_id, preview=preview)
    if frame is None:
        print(json.dumps({"success": False, "message": "Could not capture frame"}))
        return 1

    sys.stdout.buffer.write(frame)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
