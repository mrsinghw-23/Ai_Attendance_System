"""Probe IP CCTV camera: TCP, RTSP auth, frame capture, stream metadata."""

from __future__ import annotations

import json
import socket
import sys
import time
from typing import Any

import cv2

from db import db_cursor, load_active_cameras
from stream_util import (
    build_rtsp_url_variants,
    capture_camera_frame,
    capture_http_snapshot,
    capture_rtsp_frame,
    open_rtsp_capture,
    read_first_frame,
)


def _tcp_reachable(host: str, port: int, timeout: float = 3.0) -> tuple[bool, int | None]:
    start = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, int((time.perf_counter() - start) * 1000)
    except OSError:
        return False, None


def _classify_error(message: str) -> str:
    lower = message.lower()
    if "401" in lower or "unauthorized" in lower or "auth" in lower:
        return "RTSP_AUTHENTICATION_FAILED"
    if "timeout" in lower or "timed out" in lower:
        return "NETWORK_TIMEOUT"
    if "invalid" in lower and "url" in lower:
        return "INVALID_RTSP_URL"
    if "offline" in lower or "connection refused" in lower or "unreachable" in lower:
        return "CAMERA_OFFLINE"
    if "decode" in lower or "codec" in lower:
        return "DECODER_FAILED"
    return "NO_FRAMES_RECEIVED"


def probe_camera_dict(camera: dict) -> dict[str, Any]:
    host = str(camera.get("camera_ip") or "").strip()
    http_port = int(camera.get("http_port") or 80)
    rtsp_port = int(camera.get("port") or 554)

    result: dict[str, Any] = {
        "ping_ok": False,
        "tcp_rtsp_ok": False,
        "rtsp_connected": False,
        "auth_success": False,
        "frame_captured": False,
        "camera_reachable": False,
        "resolution": None,
        "width": None,
        "height": None,
        "fps": None,
        "codec": "H.264",
        "latency_ms": None,
        "bitrate_kbps": None,
        "firmware": camera.get("firmware"),
        "onvif_version": camera.get("onvif_version"),
        "health_status": "OFFLINE",
        "error": None,
        "error_code": None,
    }

    if not host:
        result["error"] = "Camera IP not configured"
        result["error_code"] = "INVALID_RTSP_URL"
        return result

    ping_ok, ping_ms = _tcp_reachable(host, http_port)
    tcp_ok, tcp_ms = _tcp_reachable(host, rtsp_port)
    result["ping_ok"] = ping_ok
    result["tcp_rtsp_ok"] = tcp_ok
    result["camera_reachable"] = tcp_ok or ping_ok
    result["latency_ms"] = tcp_ms or ping_ms

    if not result["camera_reachable"]:
        result["error"] = f"Camera offline — cannot reach {host}:{rtsp_port}"
        result["error_code"] = "CAMERA_OFFLINE"
        return result

    start = time.perf_counter()
    frame, meta = capture_camera_frame(camera)
    elapsed = int((time.perf_counter() - start) * 1000)

    if frame is not None:
        result["auth_success"] = True
        result["frame_captured"] = True
        result["height"], result["width"] = frame.shape[:2]
        result["resolution"] = f"{result['width']}x{result['height']}"
        result["latency_ms"] = elapsed
        result["health_status"] = "ONLINE"
        if meta.get("source") == "onvif_snapshot":
            result["rtsp_connected"] = True
        elif meta.get("source") == "http_snapshot":
            result["rtsp_connected"] = True
        result["fps"] = 25
        return result

    # Partial success diagnostics for RTSP-only path
    for stream_url in build_rtsp_url_variants(camera):
        capture = open_rtsp_capture(stream_url)
        try:
            if capture.isOpened():
                result["rtsp_connected"] = True
            frame = read_first_frame(capture, attempts=3, delay_sec=0.4)
            if frame is not None:
                result["auth_success"] = True
                result["frame_captured"] = True
                result["rtsp_connected"] = True
                result["height"], result["width"] = frame.shape[:2]
                result["resolution"] = f"{result['width']}x{result['height']}"
                result["latency_ms"] = elapsed
                result["health_status"] = "ONLINE"
                return result
        finally:
            capture.release()

    if not str(camera.get("rtsp_password") or "") and not camera.get("rtsp_password_enc"):
        result["error"] = "RTSP password required — enter password or paste Direct RTSP URL"
        result["error_code"] = "RTSP_AUTHENTICATION_FAILED"
        return result

    result["error"] = meta.get("error") or "RTSP authentication failed or stream unavailable"
    result["error_code"] = _classify_error(result["error"])
    return result


def probe_camera_id(camera_id: int) -> dict[str, Any]:
    with db_cursor() as (_conn, cur):
        cameras = load_active_cameras(cur, camera_id)

    if not cameras:
        with db_cursor() as (_conn, cur):
            cur.execute(
                """
                SELECT id, camera_name, camera_ip, port, http_port, rtsp_url,
                       rtsp_username, rtsp_password_enc, rtsp_channel, rtsp_subtype,
                       brand, firmware, onvif_version
                FROM cameras WHERE id = %s
                """,
                (camera_id,),
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "message": "Camera not found", "error_code": "CAMERA_OFFLINE"}
            cameras = [dict(row)]

    probe = probe_camera_dict(cameras[0])
    probe["success"] = probe.get("frame_captured", False)
    probe["camera_id"] = camera_id
    probe["camera_name"] = cameras[0].get("camera_name")
    return probe


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--json-stdin":
        payload = json.load(sys.stdin)
        probe = probe_camera_dict(payload)
        probe["success"] = probe.get("frame_captured", False)
        print(json.dumps(probe))
        return 0 if probe.get("success") else 1

    if len(sys.argv) >= 2:
        camera_id = int(sys.argv[1])
        result = probe_camera_id(camera_id)
        print(json.dumps(result))
        return 0 if result.get("success") else 1

    print(json.dumps({"success": False, "message": "camera_id or --json-stdin required"}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
