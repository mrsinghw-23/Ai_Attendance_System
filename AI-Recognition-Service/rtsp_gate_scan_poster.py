"""Multithreaded RTSP worker that posts face encodings to Next.js gate-scan API.

Usage:
  python rtsp_gate_scan_poster.py --rtsp-url "rtsp://user:pass@ip:554/video/live?channel=1&subtype=0" --gateway-id 13
"""

from __future__ import annotations

import argparse
import logging
import threading
import time
from dataclasses import dataclass

import cv2
import requests

from config import AI_SERVICE_API_KEY, FRONTEND_API_URL
from recognition import FaceEngine


logger = logging.getLogger("rtsp-gate-scan")

API_COOLDOWN_SECONDS = 1.0
READ_SLEEP_SECONDS = 0.01


@dataclass
class SharedFrame:
    ok: bool = False
    frame: object | None = None
    ts: float = 0.0


class MultithreadedRTSPCamera:
    """Drain RTSP buffer continuously in background thread."""

    def __init__(self, src: str):
        self.src = src
        self.capture = cv2.VideoCapture(src)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        self.shared = SharedFrame()
        self._lock = threading.Lock()
        self._running = True
        self._thread = threading.Thread(target=self._update, daemon=True)
        self._thread.start()

    def _update(self):
        while self._running:
            if not self.capture.isOpened():
                self.capture.release()
                self.capture = cv2.VideoCapture(self.src)
                self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 2)
                time.sleep(0.2)
                continue

            ok, frame = self.capture.read()
            if ok and frame is not None:
                with self._lock:
                    self.shared.ok = True
                    self.shared.frame = frame
                    self.shared.ts = time.time()
            else:
                time.sleep(0.05)

            time.sleep(READ_SLEEP_SECONDS)

    def read(self) -> tuple[bool, object | None]:
        with self._lock:
            return self.shared.ok, self.shared.frame

    def stop(self):
        self._running = False
        self._thread.join(timeout=1.0)
        self.capture.release()


def configure_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


def main() -> int:
    configure_logging()

    parser = argparse.ArgumentParser(
        description="RTSP -> face embedding -> /api/ai/gate-scan bridge"
    )
    parser.add_argument("--rtsp-url", required=True)
    parser.add_argument("--gateway-id", required=True)
    parser.add_argument("--api-endpoint", default=f"{FRONTEND_API_URL}/api/ai/gate-scan")
    parser.add_argument("--show", action="store_true", help="Show debug preview window")
    parser.add_argument("--det-size", type=int, default=640)
    args = parser.parse_args()

    camera = MultithreadedRTSPCamera(args.rtsp_url)
    http = requests.Session()
    last_api_post_time = 0.0

    face_engine = FaceEngine.get()

    logger.info("Started RTSP worker for gateway %s", args.gateway_id)
    try:
        while True:
            ok, frame = camera.read()
            if not ok or frame is None:
                time.sleep(0.02)
                continue

            small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
            faces = face_engine.detect_faces(small)
            now = time.time()

            if faces and now - last_api_post_time >= API_COOLDOWN_SECONDS:
                last_api_post_time = now
                face = faces[0]
                payload = {
                    "gateway_id": args.gateway_id,
                    "face_matrix_encoding": face.embedding.tolist(),
                }

                try:
                    response = http.post(
                        args.api_endpoint,
                        json=payload,
                        timeout=2.5,
                        headers={
                            "Content-Type": "application/json",
                            "x-ai-service-key": AI_SERVICE_API_KEY,
                        },
                    )
                    if response.ok:
                        logger.info("Gate scan sync success (%s)", response.status_code)
                    else:
                        logger.warning(
                            "Gate scan API error: %s %s",
                            response.status_code,
                            response.text[:180],
                        )
                except Exception as error:  # noqa: BLE001
                    logger.warning("Gate scan API unreachable: %s", error)

            if args.show:
                # Draw small preview; useful when tuning camera framing.
                for detected in faces:
                    x1, y1, x2, y2 = [int(v * 4) for v in detected.bbox]
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
                cv2.imshow("RTSP Gate Scanner", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        camera.stop()
        if args.show:
            cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
