"""Shared RTSP / HTTP snapshot helpers for CP Plus / Dahua cameras."""

from __future__ import annotations

import os
import time
from typing import Any
from urllib.parse import quote

import cv2
import numpy as np
import requests
from requests.auth import HTTPBasicAuth, HTTPDigestAuth

from onvif_util import capture_onvif_snapshot
from recognition import _camera_password, _rtsp_path, build_stream_url

try:
    requests.packages.urllib3.disable_warnings()
except Exception:
    pass


def configure_ffmpeg_rtsp() -> None:
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;10000000"


def build_rtsp_url_variants(camera: dict) -> list[str]:
    urls: list[str] = []

    primary = str(camera.get("rtsp_stream_url") or "").strip()
    if primary:
        urls.append(primary)

    built = build_stream_url(camera)
    if built and built not in urls:
        urls.append(built)

    username = str(camera.get("rtsp_username") or "")
    password = _camera_password(camera) or str(camera.get("rtsp_password") or "")
    host = str(camera.get("camera_ip") or "").strip()
    if not host or not username:
        return urls

    port = int(camera.get("port") or 554)
    channel = int(camera.get("rtsp_channel") or 1)
    brand = camera.get("brand")
    auth = f"{quote(username, safe='')}:{quote(password, safe='')}@" if password else f"{quote(username, safe='')}@"

    for subtype in (0, int(camera.get("rtsp_subtype") or 0), 1):
        path = _rtsp_path(channel, subtype, brand)
        candidate = f"rtsp://{auth}{host}:{port}{path}"
        if candidate not in urls:
            urls.append(candidate)

    return urls


def open_rtsp_capture(stream_url: str) -> cv2.VideoCapture:
    configure_ffmpeg_rtsp()
    capture = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return capture


def read_first_frame(
    capture: cv2.VideoCapture,
    *,
    attempts: int = 10,
    delay_sec: float = 0.6,
) -> np.ndarray | None:
    for _ in range(attempts):
        ok, frame = capture.read()
        if ok and frame is not None:
            return frame
        time.sleep(delay_sec)
    return None


def capture_http_snapshot(camera: dict) -> np.ndarray | None:
    onvif_frame, _meta = capture_onvif_snapshot(camera, main_stream=True)
    if onvif_frame is not None:
        return onvif_frame

    host = str(camera.get("camera_ip") or "").strip()
    if not host:
        return None

    username = str(camera.get("rtsp_username") or "")
    password = _camera_password(camera) or str(camera.get("rtsp_password") or "")
    if not username or not password:
        return None

    http_port = int(camera.get("http_port") or 80)
    https_port = int(camera.get("https_port") or 443)
    channel = int(camera.get("rtsp_channel") or 1)
    encoded_user = quote(username, safe="")
    encoded_pass = quote(password, safe="")
    paths = [
        f"/cgi-bin/snapshot.cgi?channel={channel}",
        f"/cgi-bin/snapshot.cgi?channel={channel}&subtype=0",
        f"/cgi-bin/snapshot.cgi?channel={channel}&subtype=1",
    ]

    auth_modes = [
        HTTPDigestAuth(username, password),
        HTTPBasicAuth(username, password),
    ]

    for path in paths:
        url = f"http://{host}:{http_port}{path}"
        for auth in auth_modes:
            try:
                response = requests.get(url, auth=auth, timeout=10, verify=False)
                if response.status_code != 200 or not response.content:
                    continue
                arr = np.frombuffer(response.content, dtype=np.uint8)
                frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if frame is not None:
                    return frame
            except Exception:
                continue

        for scheme, port in (("https", https_port), ("http", http_port)):
            embedded = f"{scheme}://{encoded_user}:{encoded_pass}@{host}:{port}{path}"
            try:
                response = requests.get(embedded, timeout=10, verify=False)
                if response.status_code != 200 or not response.content:
                    continue
                arr = np.frombuffer(response.content, dtype=np.uint8)
                frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if frame is not None:
                    return frame
            except Exception:
                continue

    return None


def capture_rtsp_frame(camera: dict) -> tuple[np.ndarray | None, str | None]:
    last_error = "RTSP authentication failed or stream unavailable"
    for stream_url in build_rtsp_url_variants(camera):
        capture = None
        try:
            capture = open_rtsp_capture(stream_url)
            frame = read_first_frame(capture)
            if frame is not None:
                return frame, stream_url
            last_error = "No frames received from RTSP stream"
        except Exception as exc:
            last_error = str(exc)
        finally:
            if capture is not None:
                capture.release()
    return None, last_error


def capture_camera_frame(camera: dict) -> tuple[np.ndarray | None, dict[str, Any]]:
    meta: dict[str, Any] = {
        "source": None,
        "stream_url": None,
        "snapshot_url": None,
        "error": None,
    }

    onvif_frame, onvif_meta = capture_onvif_snapshot(camera, main_stream=True)
    if onvif_frame is not None:
        meta["source"] = "onvif_snapshot"
        meta["snapshot_url"] = onvif_meta.get("snapshot_url")
        return onvif_frame, meta

    http_frame = capture_http_snapshot(camera)
    if http_frame is not None:
        meta["source"] = "http_snapshot"
        return http_frame, meta

    rtsp_frame, stream_url = capture_rtsp_frame(camera)
    if rtsp_frame is not None:
        meta["source"] = "rtsp"
        meta["stream_url"] = stream_url
        return rtsp_frame, meta

    meta["error"] = "No frames received from RTSP stream"
    return None, meta
