import json

from pathlib import Path

from urllib.parse import quote, urlparse



import cv2

import numpy as np

from insightface.app import FaceAnalysis



from config import EMBEDDING_MODEL, FRONTEND_PUBLIC_PATH, ONNX_PROVIDER

from crypto_util import decrypt_secret, has_encrypted_secret
from db import db_cursor, load_registration_images, upsert_embedding





def resolve_public_path(image_path: str) -> Path:

    normalized = image_path.lstrip("/")

    if normalized.startswith("uploads/"):

        return FRONTEND_PUBLIC_PATH / normalized

    return FRONTEND_PUBLIC_PATH / normalized





def _path_style(brand: str | None) -> str:

    normalized = (brand or "").lower()

    if "dahua" in normalized or "hikvision" in normalized:

        return "realmonitor"

    return "video_live"





def _rtsp_path(channel: int = 1, subtype: int = 0, brand: str | None = None) -> str:

    if _path_style(brand) == "realmonitor":

        return f"/cam/realmonitor?channel={channel}&subtype={subtype}"

    return f"/video/live?channel={channel}&subtype={subtype}"





def _inject_credentials(url: str, username: str, password: str) -> str:

    if not url.startswith("rtsp://"):

        return url

    if not username:

        return url

    without_scheme = url[len("rtsp://") :].lstrip()

    if "@" in without_scheme.split("/")[0]:

        without_scheme = without_scheme.split("@", 1)[1]

    auth = (

        f"{quote(username, safe='')}:{quote(password, safe='')}@"

        if password

        else f"{quote(username, safe='')}@"

    )

    return f"rtsp://{auth}{without_scheme}"





def _camera_password(camera: dict) -> str:

    plain = str(camera.get("rtsp_password") or "")

    if plain:

        return plain

    if has_encrypted_secret(camera.get("rtsp_password_enc")):

        return decrypt_secret(str(camera["rtsp_password_enc"]))

    return ""





def build_snapshot_url(camera: dict) -> str | None:
    raw = str(camera.get("rtsp_url") or "").strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        if parsed.path.endswith(".jpg") or "shot" in parsed.path:
            return raw
        origin = f"{parsed.scheme}://{parsed.netloc}"
        return f"{origin}/shot.jpg"

    host = str(camera.get("camera_ip") or "").strip()
    if not host:
        return None

    http_port = int(camera.get("http_port") or 80)
    channel = int(camera.get("rtsp_channel") or 1)
    username = str(camera.get("rtsp_username") or "")
    password = _camera_password(camera)
    path = f"/cgi-bin/snapshot.cgi?channel={channel}"

    if username and password:
        return f"http://{quote(username)}:{quote(password)}@{host}:{http_port}{path}"
    if username:
        return f"http://{quote(username)}@{host}:{http_port}{path}"
    return f"http://{host}:{http_port}{path}"





def build_stream_url(camera: dict) -> str | None:

    """Resolve RTSP URL for CP Plus / NVR (path /video/live). Credentials injected at runtime."""

    username = str(camera.get("rtsp_username") or "")

    password = _camera_password(camera)

    channel = int(camera.get("rtsp_channel") or 1)

    subtype = int(camera.get("rtsp_subtype") or 0)

    brand = camera.get("brand")



    raw = str(camera.get("rtsp_url") or "").strip()

    if raw.startswith("rtsp://"):

        return _inject_credentials(raw, username, password)

    if raw.startswith("http://") or raw.startswith("https://"):

        return raw



    host = str(camera.get("camera_ip") or "").strip()

    if not host:

        return None



    port = int(camera.get("port") or 554)

    path = _rtsp_path(channel, subtype, brand)



    if username:

        auth = (

            f"{quote(username)}:{quote(password)}@"

            if password

            else f"{quote(username)}@"

        )

        return f"rtsp://{auth}{host}:{port}{path}"



    return f"rtsp://{host}:{port}{path}"





def build_rtsp_url(camera: dict) -> str | None:

    return build_stream_url(camera)





class FaceEngine:

    _instance = None



    @classmethod

    def get(cls, model_name: str | None = None) -> "FaceEngine":

        target = model_name or EMBEDDING_MODEL

        if cls._instance is None or cls._instance.model_name != target:

            cls._instance = cls(target)

        return cls._instance



    def __init__(self, model_name: str):

        self.model_name = model_name

        providers = [ONNX_PROVIDER]

        self.app = FaceAnalysis(name=model_name, providers=providers)

        self.app.prepare(ctx_id=0, det_size=(640, 640))



    def detect_faces(self, image_bgr: np.ndarray):

        if image_bgr is None or image_bgr.size == 0:

            return []

        return self.app.get(image_bgr)



    def embedding_from_image_path(self, image_path: Path) -> np.ndarray | None:

        image = cv2.imread(str(image_path))

        if image is None:

            return None

        faces = self.detect_faces(image)

        if not faces:

            return None

        return np.array(faces[0].embedding, dtype=np.float32)





def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:

    denom = float(np.linalg.norm(a) * np.linalg.norm(b))

    if denom == 0:

        return 0.0

    return float(np.dot(a, b) / denom)





def sync_embeddings(model_name: str | None = None, employee_id: int | None = None) -> dict:

    engine = FaceEngine.get(model_name)

    created = 0

    updated = 0

    skipped = 0

    employees = set()



    with db_cursor() as (_, cur):

        images = load_registration_images(cur, employee_id)



    for item in images:

        path = resolve_public_path(item["image_path"])

        if not path.exists():

            skipped += 1

            continue



        embedding = engine.embedding_from_image_path(path)

        if embedding is None:

            skipped += 1

            continue



        payload = json.dumps(embedding.tolist())

        with db_cursor() as (_, cur):

            result = upsert_embedding(

                cur,

                employee_id=int(item["employee_id"]),

                face_profile_id=int(item["face_profile_id"]) if item.get("face_profile_id") else None,

                source_image_id=int(item["source_image_id"]),

                embedding_data=payload,

                model_name=engine.model_name,

                dimensions=len(embedding),

            )



        employees.add(int(item["employee_id"]))

        if result == "created":

            created += 1

        else:

            updated += 1



    return {

        "images_processed": len(images),

        "embeddings_created": created,

        "embeddings_updated": updated,

        "employees_covered": len(employees),

        "skipped": skipped,

        "model_name": engine.model_name,

    }

