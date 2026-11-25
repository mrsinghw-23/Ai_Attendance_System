# AI Recognition Service – Deployment Guide

Production face recognition pipeline for the AI Attendance System.

## Architecture

```
RTSP Camera (cameras master)
        ↓
Motion Detection (OpenCV frame diff)
        ↓
Face Detection (InsightFace)
        ↓
Face Recognition (embedding cosine match)
        ↓
face_events (PostgreSQL + API)
        ↓
Attendance Engine (Next.js API)
```

## Prerequisites

- Python 3.10+
- PostgreSQL (same database as Frontend)
- Node.js Frontend running (`npm run dev` or production build)
- Registered employee face images (`employee_face_images`, status `FULLY_REGISTERED`)
- Active cameras with RTSP URL or IP/port/credentials in **Cameras** master
- FFmpeg available on PATH (used by OpenCV for RTSP)

## 1. Apply database migration

From `Frontend/`:

```powershell
npm run db:migrate -- 010_production_ai_face_recognition.sql
```

This creates:

- `unknown_faces`
- `ai_recognition_stats`
- `ai_recognition_events`
- AI recognition settings in `system_settings`

## 2. Configure environment

Copy and edit:

```bash
cd AI-Recognition-Service
copy .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DB_*` | Must match `Frontend/.env.local` |
| `CREDENTIAL_ENCRYPTION_KEY` | Must match Frontend (for RTSP password decrypt) |
| `FRONTEND_API_URL` | e.g. `http://localhost:3000` |
| `AI_SERVICE_API_KEY` | Shared secret for internal API calls |
| `FRONTEND_PUBLIC_PATH` | Path to `Frontend/public` (face image uploads) |
| `ONNX_PROVIDER` | `CPUExecutionProvider` or `CUDAExecutionProvider` |

Add to `Frontend/.env.local`:

```env
AI_SERVICE_API_KEY=ai-service-local-key-change-me
```

Use the same value in `AI-Recognition-Service/.env`.

## 3. Install Python dependencies

```bash
cd AI-Recognition-Service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

InsightFace downloads the `buffalo_l` model on first run (~300MB).

## 4. Generate embeddings

Run once after employees complete face registration:

```bash
python main.py --sync-embeddings
```

Expected output:

```json
{
  "images_processed": 20,
  "embeddings_created": 20,
  "embeddings_updated": 0,
  "employees_covered": 4,
  "skipped": 0,
  "model_name": "buffalo_l"
}
```

Embeddings are stored in `face_embeddings` linked to `employee_face_images`.

## 5. Start the recognition service

Process all active cameras:

```bash
python main.py
```

Single camera:

```bash
python main.py --camera-id 1
```

The service will:

1. Load RTSP streams from camera master
2. Detect motion using configured sensitivity
3. Run face recognition only when motion is detected
4. Post `FACE_RECOGNIZED` events via `/api/ai/face-events`
5. Store unknown faces in `unknown_faces` with snapshot images
6. Trigger `/api/attendance/engine/process` periodically

## 6. Attendance rules

The attendance engine (Phase 9) processes face events:

- **First recognition of the day** → Check-In
- **Continued recognition** → Presence IN tracking
- **Last valid recognition after checkout threshold** → Check-Out

Configure checkout threshold in **Settings → Attendance Rules** (engine config).

## 7. Dashboard & settings

**Dashboard (AI Operations Center):**

- Faces Detected
- Faces Recognized
- Unknown Faces
- Attendance Generated
- AI Active Cameras

**Settings → AI Face Recognition:**

- Recognition confidence threshold (default `0.65`)
- Motion sensitivity (default `25`)
- Frame sampling interval (default `500` ms)

APIs:

- `GET /api/ai/dashboard`
- `GET /api/ai/recognition/unknown-faces`
- `GET|PUT /api/ai/recognition-settings`

## 8. Production deployment (Windows Service / Linux systemd)

### Windows (NSSM)

```powershell
nssm install AIRecognition "E:\AI-Atten-Sytem\AI-Recognition-Service\.venv\Scripts\python.exe" "E:\AI-Atten-Sytem\AI-Recognition-Service\main.py"
nssm set AIRecognition AppDirectory "E:\AI-Atten-Sytem\AI-Recognition-Service"
nssm start AIRecognition
```

### Linux systemd

```ini
[Unit]
Description=AI Attendance Recognition Service
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/AI-Atten-Sytem/AI-Recognition-Service
EnvironmentFile=/opt/AI-Atten-Sytem/AI-Recognition-Service/.env
ExecStart=/opt/AI-Atten-Sytem/AI-Recognition-Service/.venv/bin/python main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

## 9. Verification checklist

- [ ] Migration 010 applied
- [ ] Employees fully registered (5 poses)
- [ ] `python main.py --sync-embeddings` creates rows in `face_embeddings`
- [ ] Cameras show RTSP reachable in **Cameras → Live Operations**
- [ ] Recognition service connects (logs: `Connected to camera X`)
- [ ] Dashboard counters increment during live recognition
- [ ] Attendance check-in/out appears in **Attendance**

## 10. Troubleshooting

| Issue | Fix |
|-------|-----|
| RTSP connection failed | Verify camera IP, port, credentials; test URL in VLC |
| No embeddings | Ensure images exist under `Frontend/public/uploads/faces/` |
| Low match rate | Lower confidence threshold in Settings; add more face poses |
| API 401 on face events | Match `AI_SERVICE_API_KEY` in Frontend and Python `.env` |
| High CPU | Increase `frameSamplingIntervalMs`; reduce active cameras |

## Test script

From `Frontend/`:

```bash
node scripts/test-phase12.mjs
```
