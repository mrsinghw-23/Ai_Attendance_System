"""One-shot face match from a JPEG/PNG file. Outputs JSON to stdout."""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from db import db_cursor, load_employee_embeddings, load_recognition_settings
from recognition import FaceEngine, cosine_similarity


def best_match(
    probe: np.ndarray,
    embeddings: list[dict],
    threshold: float,
) -> tuple[dict | None, float]:
    best_employee = None
    best_score = 0.0
    grouped: dict[int, list[np.ndarray]] = {}

    for row in embeddings:
        employee_id = int(row["employee_id"])
        grouped.setdefault(employee_id, []).append(
            np.array(row["vector"], dtype=np.float32)
        )

    for employee_id, vectors in grouped.items():
        score = max(cosine_similarity(probe, vector) for vector in vectors)
        if score > best_score:
            best_score = score
            best_employee = next(
                row for row in embeddings if int(row["employee_id"]) == employee_id
            )

    if best_employee and best_score >= threshold:
        return best_employee, best_score
    return None, best_score


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"matched": False, "error": "image path required"}))
        return 1

    image_path = Path(sys.argv[1])
    embed_only = len(sys.argv) > 2 and sys.argv[2] == "--embed-only"

    if not image_path.exists():
        print(json.dumps({"matched": False, "error": "image not found"}))
        return 1

    image = cv2.imread(str(image_path))
    if image is None:
        print(json.dumps({"matched": False, "error": "invalid image"}))
        return 1

    with db_cursor() as (_, cur):
        settings = load_recognition_settings(cur)
        embeddings = load_employee_embeddings(cur)

    if not embeddings:
        print(json.dumps({"matched": False, "error": "no registered face embeddings"}))
        return 0

    engine = FaceEngine.get(settings.get("embeddingModel"))
    faces = engine.detect_faces(image)
    if not faces:
        print(json.dumps({"matched": False, "face_detected": False, "error": "no face detected"}))
        return 0

    probe = np.array(faces[0].embedding, dtype=np.float32)

    if embed_only:
        print(
            json.dumps(
                {
                    "face_detected": True,
                    "embedding": probe.tolist(),
                }
            )
        )
        return 0

    threshold = float(settings.get("confidenceThreshold", 0.65))
    match, score = best_match(probe, embeddings, threshold)

    if not match:
        print(
            json.dumps(
                {
                    "matched": False,
                    "face_detected": True,
                    "confidence": round(score, 4),
                    "error": "no match",
                }
            )
        )
        return 0

    print(
        json.dumps(
            {
                "matched": True,
                "face_detected": True,
                "employee_id": int(match["employee_id"]),
                "employee_name": match.get("employee_name"),
                "employee_code": match.get("employee_code"),
                "confidence": round(score, 4),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
