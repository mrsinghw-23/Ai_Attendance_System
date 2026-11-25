import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "ai_attendance_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

CREDENTIAL_ENCRYPTION_KEY = os.getenv(
    "CREDENTIAL_ENCRYPTION_KEY",
    os.getenv("JWT_SECRET", "AI_ATTENDANCE_SUPER_SECRET_2026"),
)

FRONTEND_API_URL = os.getenv("FRONTEND_API_URL", "http://localhost:3000").rstrip("/")
AI_SERVICE_API_KEY = os.getenv(
    "AI_SERVICE_API_KEY",
    os.getenv("INTERNAL_API_KEY", "ai-service-local-key-change-me"),
)

FRONTEND_PUBLIC_PATH = Path(
    os.getenv("FRONTEND_PUBLIC_PATH", str(BASE_DIR / ".." / "Frontend" / "public"))
).resolve()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "buffalo_l")
CAMERA_ID = os.getenv("CAMERA_ID", "").strip()
ONNX_PROVIDER = os.getenv("ONNX_PROVIDER", "CPUExecutionProvider")

UNKNOWN_UPLOAD_DIR = FRONTEND_PUBLIC_PATH / "uploads" / "unknown"

DEFAULT_SETTINGS = {
    "confidenceThreshold": 0.65,
    "motionSensitivity": 25,
    "frameSamplingIntervalMs": 500,
    "embeddingModel": EMBEDDING_MODEL,
    "embeddingSyncIntervalMinutes": 30,
    "unknownFaceCooldownSeconds": 60,
    "recognitionCooldownSeconds": 30,
    "continuousScanning": False,
    "storeUnknownFaces": False,
}
