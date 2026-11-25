"""ONVIF helpers for CP Plus cameras (snapshot + stream URI discovery)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote

import cv2
import numpy as np
import requests
from requests.auth import HTTPBasicAuth, HTTPDigestAuth

from recognition import _camera_password

try:
    requests.packages.urllib3.disable_warnings()
except Exception:
    pass

_snapshot_url_cache: dict[str, str] = {}
_http_sessions: dict[str, requests.Session] = {}


def _session_key(host: str, username: str) -> str:
    return f"{host}:{username}"


def _get_http_session(host: str, username: str, password: str) -> requests.Session:
    key = _session_key(host, username)
    existing = _http_sessions.get(key)
    if existing is not None:
        return existing

    session = requests.Session()
    session.verify = False
    session.auth = HTTPDigestAuth(username, password)
    _http_sessions[key] = session
    return session


def _camera_cache_key(camera: dict) -> str:
    host = str(camera.get("camera_ip") or "").strip()
    channel = int(camera.get("rtsp_channel") or 1)
    subtype = int(camera.get("rtsp_subtype") or 0)
    return f"{host}:{channel}:{subtype}"


def _onvif_media_url(host: str, https_port: int = 443, http_port: int = 80) -> list[str]:
    return [
        f"https://{host}:{https_port}/onvif/media_service",
        f"http://{host}:{http_port}/onvif/media_service",
    ]


def _soap_post(
    url: str,
    body: str,
    username: str,
    password: str,
) -> str | None:
    envelope = f"""<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Body>{body}</s:Body>
</s:Envelope>"""
    auth = HTTPDigestAuth(username, password)
    try:
        response = requests.post(
            url,
            data=envelope,
            auth=auth,
            headers={"Content-Type": "application/soap+xml; charset=utf-8"},
            timeout=12,
            verify=False,
        )
        if response.status_code != 200:
            return None
        return response.text
    except Exception:
        return None


def discover_onvif_snapshot_url(camera: dict) -> str | None:
    host = str(camera.get("camera_ip") or "").strip()
    username = str(camera.get("rtsp_username") or "")
    password = _camera_password(camera) or str(camera.get("rtsp_password") or "")
    if not host or not username or not password:
        return None

    profile_token = str(camera.get("onvif_profile_token") or "Profile000")
    body = f"""<trt:GetSnapshotUri>
      <trt:ProfileToken>{profile_token}</trt:ProfileToken>
    </trt:GetSnapshotUri>"""

    https_port = int(camera.get("https_port") or 443)
    http_port = int(camera.get("http_port") or 80)

    for media_url in _onvif_media_url(host, https_port, http_port):
        xml = _soap_post(media_url, body, username, password)
        if not xml:
            continue
        match = re.search(r"<tt:Uri>([^<]+)</tt:Uri>", xml)
        if match:
            return unquote(match.group(1).replace("&amp;", "&"))
    return None


def build_cp_plus_onvif_snapshot_urls(camera: dict) -> list[str]:
    host = str(camera.get("camera_ip") or "").strip()
    if not host:
        return []

    channel = int(camera.get("rtsp_channel") or 1)
    subtype = int(camera.get("rtsp_subtype") or 0)
    https_port = int(camera.get("https_port") or 443)
    http_port = int(camera.get("http_port") or 80)
    query = f"channel={channel}&subtype={subtype}"

    return [
        f"https://{host}:{https_port}/onvifsnapshot/media_service/snapshot?{query}",
        f"http://{host}:{http_port}/onvifsnapshot/media_service/snapshot?{query}",
    ]


def fetch_snapshot_url(url: str, username: str, password: str) -> np.ndarray | None:
    host = ""
    try:
        host = url.split("//", 1)[1].split("/", 1)[0].split("@")[-1].split(":")[0]
    except Exception:
        pass

    session = _get_http_session(host, username, password) if host else requests.Session()
    auth_modes = [None, HTTPBasicAuth(username, password)] if host else [
        HTTPDigestAuth(username, password),
        HTTPBasicAuth(username, password),
    ]

    for auth in auth_modes:
        try:
            response = session.get(url, auth=auth, timeout=8, verify=False)
            if response.status_code != 200 or not response.content:
                continue
            arr = np.frombuffer(response.content, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is not None:
                return frame
        except Exception:
            continue
    return None


def resolve_snapshot_url(camera: dict) -> str | None:
    cache_key = _camera_cache_key(camera)
    cached = _snapshot_url_cache.get(cache_key)
    if cached:
        return cached

    discovered = discover_onvif_snapshot_url(camera)
    if discovered:
        _snapshot_url_cache[cache_key] = discovered
        return discovered

    for url in build_cp_plus_onvif_snapshot_urls(camera):
        _snapshot_url_cache[cache_key] = url
        return url

    return None


def capture_onvif_snapshot(
    camera: dict,
    *,
    main_stream: bool = True,
) -> tuple[np.ndarray | None, dict[str, Any]]:
    meta: dict[str, Any] = {"source": "onvif_snapshot", "snapshot_url": None}
    username = str(camera.get("rtsp_username") or "")
    password = _camera_password(camera) or str(camera.get("rtsp_password") or "")
    if not username or not password:
        meta["error"] = "Missing camera credentials"
        return None, meta

    capture_camera = dict(camera)
    if main_stream:
        capture_camera["rtsp_subtype"] = 0
        capture_camera["onvif_profile_token"] = "Profile000"

    snapshot_url = resolve_snapshot_url(capture_camera)
    if not snapshot_url:
        meta["error"] = "ONVIF snapshot unavailable"
        return None, meta

    frame = fetch_snapshot_url(snapshot_url, username, password)
    if frame is not None:
        meta["snapshot_url"] = snapshot_url
        return frame, meta

    _snapshot_url_cache.pop(_camera_cache_key(camera), None)
    meta["error"] = "ONVIF snapshot unavailable"
    return None, meta
