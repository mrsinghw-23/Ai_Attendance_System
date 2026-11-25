import requests

from config import AI_SERVICE_API_KEY, FRONTEND_API_URL


def post_face_event(payload: dict) -> dict | None:
    response = requests.post(
        f"{FRONTEND_API_URL}/api/ai/face-events",
        json=payload,
        headers={
            "Content-Type": "application/json",
            "x-ai-service-key": AI_SERVICE_API_KEY,
        },
        timeout=30,
    )
    response.raise_for_status()
    body = response.json()
    return body.get("data")


def trigger_attendance_engine(limit: int = 200) -> dict | None:
    response = requests.post(
        f"{FRONTEND_API_URL}/api/attendance/engine/process",
        json={"limit": limit},
        headers={
            "Content-Type": "application/json",
            "x-ai-service-key": AI_SERVICE_API_KEY,
        },
        timeout=60,
    )
    response.raise_for_status()
    body = response.json()
    return body.get("data")
