import logging
import threading
import time
from typing import Any

from config import CAMERA_ID
from db import (
    db_cursor,
    load_active_cameras,
    load_employee_embeddings,
    load_recognition_settings,
    set_active_cameras,
)
from recognition import sync_embeddings
from rtsp_worker import RtspWorker

logger = logging.getLogger(__name__)


class RecognitionPipeline:
    def __init__(self, camera_id: int | None = None):
        self.camera_id = camera_id or (int(CAMERA_ID) if CAMERA_ID else None)
        self.stop_event = threading.Event()
        self.workers: dict[int, RtspWorker] = {}
        self.settings: dict[str, Any] = {}
        self.embeddings: list[dict[str, Any]] = []
        self.settings_lock = threading.Lock()
        self.embeddings_lock = threading.Lock()
        self.last_embedding_sync = 0.0
        self.last_settings_refresh = 0.0

    def refresh_settings(self) -> None:
        with db_cursor() as (_, cur):
            settings = load_recognition_settings(cur)
        with self.settings_lock:
            self.settings = settings

    def refresh_embeddings(self) -> None:
        with db_cursor() as (_, cur):
            embeddings = load_employee_embeddings(cur)
        with self.embeddings_lock:
            self.embeddings = embeddings

    def maybe_sync_embeddings(self) -> None:
        with self.settings_lock:
            interval_minutes = int(self.settings.get("embeddingSyncIntervalMinutes", 30))

        now = time.time()
        if now - self.last_embedding_sync < interval_minutes * 60:
            return

        model = self.settings.get("embeddingModel")
        result = sync_embeddings(model)
        self.last_embedding_sync = now
        self.refresh_embeddings()
        logger.info("Embedding sync complete: %s", result)

    def sync_camera_workers(self) -> None:
        with db_cursor() as (_, cur):
            cameras = load_active_cameras(cur, self.camera_id)

        active_ids = {int(camera["id"]) for camera in cameras}

        for camera_id, worker in list(self.workers.items()):
            if camera_id not in active_ids:
                worker.stop_event.set()
                del self.workers[camera_id]

        for camera in cameras:
            camera_id = int(camera["id"])
            if camera_id in self.workers:
                continue

            worker = RtspWorker(
                camera=camera,
                settings=self.settings,
                embeddings=self.embeddings,
                stop_event=threading.Event(),
                embeddings_lock=self.embeddings_lock,
                settings_lock=self.settings_lock,
            )
            self.workers[camera_id] = worker
            worker.start()

        with db_cursor() as (_, cur):
            set_active_cameras(cur, len(self.workers))

    def run(self) -> None:
        logger.info("Starting AI recognition pipeline")
        self.refresh_settings()
        sync_result = sync_embeddings(self.settings.get("embeddingModel"))
        logger.info("Initial embedding sync: %s", sync_result)
        self.refresh_embeddings()
        self.last_embedding_sync = time.time()

        while not self.stop_event.is_set():
            now = time.time()
            if now - self.last_settings_refresh >= 30:
                self.refresh_settings()
                self.last_settings_refresh = now

            self.maybe_sync_embeddings()
            self.sync_camera_workers()
            time.sleep(10)

    def stop(self) -> None:
        self.stop_event.set()
        for worker in self.workers.values():
            worker.stop_event.set()
