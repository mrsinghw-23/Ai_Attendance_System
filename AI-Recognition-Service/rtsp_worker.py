import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
import requests

from api_client import post_face_event, trigger_attendance_engine
from config import UNKNOWN_UPLOAD_DIR
from db import db_cursor, insert_unknown_face, increment_reconnect_count, log_recognition_event, update_camera_runtime
from recognition import (
    FaceEngine,
    build_snapshot_url,
    build_stream_url,
    cosine_similarity,
)
from stream_util import (
    build_rtsp_url_variants,
    capture_http_snapshot,
    open_rtsp_capture,
    read_first_frame,
)

logger = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    return datetime.now(IST).replace(tzinfo=None)


class RtspWorker(threading.Thread):
    def __init__(
        self,
        camera: dict,
        settings: dict,
        embeddings: list[dict],
        stop_event: threading.Event,
        embeddings_lock: threading.Lock,
        settings_lock: threading.Lock,
    ):
        super().__init__(daemon=True)
        self.camera = camera
        self.settings = settings
        self.embeddings = embeddings
        self.stop_event = stop_event
        self.embeddings_lock = embeddings_lock
        self.settings_lock = settings_lock
        self.camera_id = int(camera["id"])
        self.location_id = camera.get("location_id")
        self.last_frame_gray: np.ndarray | None = None
        self.last_recognition_at: dict[int, float] = {}
        self.last_unknown_at = 0.0
        self.engine = FaceEngine.get(settings.get("embeddingModel"))
        self.capture: cv2.VideoCapture | None = None
        self.stream_mode = "capture"
        self.stream_url: str | None = None
        self.snapshot_url: str | None = None
        self.connected_at = 0.0
        self.frames_processed = 0
        self.recognitions_processed = 0
        self.last_runtime_publish = 0.0
        self.last_frame_at: float = 0.0
        self.motion_active = False

    def _current_settings(self) -> dict:
        with self.settings_lock:
            return dict(self.settings)

    def _current_embeddings(self) -> list[dict]:
        with self.embeddings_lock:
            return list(self.embeddings)

    def _connect(self) -> bool:
        stream_url = build_stream_url(self.camera)
        if not stream_url:
            logger.error("Camera %s has no stream configuration", self.camera_id)
            return False

        self.stream_url = stream_url
        self.snapshot_url = build_snapshot_url(self.camera)

        if self.capture is not None:
            self.capture.release()
            self.capture = None

        if stream_url.startswith("http://") or stream_url.startswith("https://"):
            cap = open_rtsp_capture(stream_url)
            if cap.isOpened():
                frame = read_first_frame(cap, attempts=5, delay_sec=0.4)
                if frame is not None:
                    self.capture = cap
                    self.stream_mode = "capture"
                    logger.info(
                        "Connected to camera %s via MJPEG (%s)",
                        self.camera_id,
                        stream_url,
                    )
                    return True
                cap.release()

            http_frame = capture_http_snapshot(self.camera)
            if http_frame is not None:
                self.stream_mode = "snapshot"
                logger.info(
                    "Using HTTP snapshot polling for camera %s",
                    self.camera_id,
                )
                return True

            if self.snapshot_url:
                self.stream_mode = "snapshot"
                logger.info(
                    "Using snapshot polling for camera %s (%s)",
                    self.camera_id,
                    self.snapshot_url,
                )
                return True

            logger.error("Failed to open HTTP stream for camera %s", self.camera_id)
            return False

        for candidate_url in build_rtsp_url_variants(self.camera):
            cap = open_rtsp_capture(candidate_url)
            frame = read_first_frame(cap, attempts=8, delay_sec=0.5)
            if frame is not None:
                self.capture = cap
                self.stream_url = candidate_url
                self.stream_mode = "capture"
                logger.info(
                    "Connected to camera %s (%s)",
                    self.camera_id,
                    self.camera.get("camera_name"),
                )
                return True
            cap.release()

        http_frame = capture_http_snapshot(self.camera)
        if http_frame is not None:
            self.stream_mode = "snapshot"
            logger.info(
                "RTSP failed; using HTTP snapshot polling for camera %s",
                self.camera_id,
            )
            return True

        logger.error("Failed to open RTSP stream for camera %s", self.camera_id)
        with db_cursor() as (_, cur):
            log_recognition_event(
                cur,
                self.camera_id,
                "STREAM_ERROR",
                f"Unable to open stream for camera {self.camera.get('camera_name')}",
            )
        return False

    def _read_frame(self) -> np.ndarray | None:
        if self.stream_mode == "snapshot":
            frame = capture_http_snapshot(self.camera)
            if frame is not None:
                return frame

            if self.snapshot_url:
                try:
                    response = requests.get(self.snapshot_url, timeout=8)
                    if response.status_code != 200:
                        return None
                    arr = np.frombuffer(response.content, dtype=np.uint8)
                    return cv2.imdecode(arr, cv2.IMREAD_COLOR)
                except Exception as exc:
                    logger.warning("Snapshot fetch failed for camera %s: %s", self.camera_id, exc)
                    return None

            return None

        if self.capture is None or not self.capture.isOpened():
            return None

        ok, frame = self.capture.read()
        if not ok or frame is None:
            return None
        return frame

    def _motion_detected(self, frame: np.ndarray, settings: dict) -> bool:
        if settings.get("continuousScanning", False):
            return True

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if self.last_frame_gray is None:
            self.last_frame_gray = gray
            return False

        diff = cv2.absdiff(self.last_frame_gray, gray)
        score = float(np.mean(diff))
        self.last_frame_gray = gray

        sensitivity = int(settings.get("motionSensitivity", 25))
        camera_sensitivity = self.camera.get("motion_sensitivity")
        if camera_sensitivity is not None:
            sensitivity = int(camera_sensitivity)

        threshold = max(3.0, 40.0 - (sensitivity * 0.35))
        return score >= threshold

    def _best_match(self, probe: np.ndarray, threshold: float) -> tuple[dict | None, float]:
        best_employee = None
        best_score = 0.0
        grouped: dict[int, list[np.ndarray]] = {}

        for row in self._current_embeddings():
            employee_id = int(row["employee_id"])
            grouped.setdefault(employee_id, []).append(np.array(row["vector"], dtype=np.float32))

        for employee_id, vectors in grouped.items():
            score = max(cosine_similarity(probe, vector) for vector in vectors)
            if score > best_score:
                best_score = score
                best_employee = next(
                    row for row in self._current_embeddings() if int(row["employee_id"]) == employee_id
                )

        if best_employee and best_score >= threshold:
            return best_employee, best_score
        return None, best_score

    def _save_unknown_face(self, frame: np.ndarray, confidence: float) -> str:
        camera_dir = UNKNOWN_UPLOAD_DIR / str(self.camera_id)
        camera_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{now_ist().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        full_path = camera_dir / filename
        cv2.imwrite(str(full_path), frame)
        return f"/uploads/unknown/{self.camera_id}/{filename}"

    def _handle_recognition(self, frame: np.ndarray, face, settings: dict) -> None:
        now = time.time()
        probe = np.array(face.embedding, dtype=np.float32)
        threshold = float(settings.get("confidenceThreshold", 0.65))
        match, score = self._best_match(probe, threshold)
        event_time = now_ist().isoformat()

        if match:
            employee_id = int(match["employee_id"])
            cooldown = int(settings.get("recognitionCooldownSeconds", 30))
            last_seen = self.last_recognition_at.get(employee_id, 0)
            if now - last_seen < cooldown:
                return

            self.last_recognition_at[employee_id] = now
            post_face_event(
                {
                    "camera_id": self.camera_id,
                    "employee_id": employee_id,
                    "location_id": self.location_id,
                    "event_time": event_time,
                    "confidence": round(score, 4),
                    "event_type": "FACE_RECOGNIZED",
                    "metadata": {
                        "employee_name": match.get("employee_name"),
                        "employee_code": match.get("employee_code"),
                        "camera_name": self.camera.get("camera_name"),
                    },
                }
            )
            logger.info(
                "Recognized employee %s on camera %s (%.3f) — triggering attendance",
                employee_id,
                self.camera_id,
                score,
            )
            try:
                trigger_attendance_engine(limit=50)
            except Exception as exc:
                logger.warning("Attendance engine trigger failed: %s", exc)
            return

        if not bool(settings.get("storeUnknownFaces", False)):
            return

        cooldown = int(settings.get("unknownFaceCooldownSeconds", 60))
        if now - self.last_unknown_at < cooldown:
            return

        self.last_unknown_at = now
        image_ref = self._save_unknown_face(frame, score)
        with db_cursor() as (_, cur):
            insert_unknown_face(
                cur,
                camera_id=self.camera_id,
                location_id=self.location_id,
                image_path=image_ref,
                confidence=round(score, 4),
                metadata={
                    "camera_name": self.camera.get("camera_name"),
                    "location_name": self.camera.get("location_name"),
                },
            )

    def _publish_runtime(self, settings: dict, *, ai_status: str) -> None:
        now = time.time()
        if now - self.last_runtime_publish < 5:
            return

        uptime = int(now - self.connected_at) if self.connected_at else 0
        interval_ms = int(settings.get("frameSamplingIntervalMs", 500))
        processing_fps = round(1000 / max(interval_ms, 100), 1)
        window = max(now - self.last_runtime_publish, 1)
        recognition_fps = round(self.recognitions_processed / window, 2)
        self.recognitions_processed = 0
        self.last_runtime_publish = now

        stats = {
            "processing_fps": processing_fps,
            "recognition_fps": recognition_fps,
            "motion_active": self.motion_active,
            "last_frame_at": datetime.fromtimestamp(self.last_frame_at, IST).isoformat()
            if self.last_frame_at
            else None,
            "ai_status": ai_status,
            "uptime_seconds": uptime,
            "packet_loss_pct": 0,
        }

        try:
            with db_cursor() as (_, cur):
                update_camera_runtime(cur, self.camera_id, stats)
        except Exception as exc:
            logger.debug("Runtime stats update failed for camera %s: %s", self.camera_id, exc)

    def run(self) -> None:
        reconnect_delay = 5
        engine_tick = 0
        connected = False

        while not self.stop_event.is_set():
            if not connected:
                connected = self._connect()
                if not connected:
                    try:
                        with db_cursor() as (_, cur):
                            increment_reconnect_count(cur, self.camera_id)
                    except Exception:
                        pass
                    time.sleep(reconnect_delay)
                    continue
                self.connected_at = time.time()
                self.last_runtime_publish = 0.0

            settings = self._current_settings()
            interval_ms = int(settings.get("frameSamplingIntervalMs", 500))
            interval_sec = max(interval_ms / 1000.0, 0.1)

            frame = self._read_frame()
            if frame is None:
                logger.warning("Lost stream for camera %s, reconnecting", self.camera_id)
                if self.capture is not None:
                    self.capture.release()
                    self.capture = None
                connected = False
                self._publish_runtime(settings, ai_status="RECONNECTING")
                try:
                    with db_cursor() as (_, cur):
                        increment_reconnect_count(cur, self.camera_id)
                except Exception:
                    pass
                time.sleep(reconnect_delay)
                continue

            self.frames_processed += 1
            self.last_frame_at = time.time()
            motion = self._motion_detected(frame, settings)
            self.motion_active = motion

            if motion:
                faces = self.engine.detect_faces(frame)
                if faces:
                    for face in faces:
                        before = len(self.last_recognition_at)
                        self._handle_recognition(frame, face, settings)
                        if len(self.last_recognition_at) > before:
                            self.recognitions_processed += 1

            self._publish_runtime(settings, ai_status="STREAMING")

            engine_tick += 1
            if engine_tick >= 40:
                engine_tick = 0
                try:
                    trigger_attendance_engine()
                except Exception as exc:
                    logger.warning("Attendance engine trigger failed: %s", exc)

            time.sleep(interval_sec)

        if self.capture is not None:
            self.capture.release()
