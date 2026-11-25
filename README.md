# AI Attendance System

Windows-first attendance platform with:

- `Frontend/` — Next.js 16 web app, API routes, and PostgreSQL access.
- `AI-Recognition-Service/` — Python/OpenCV/InsightFace camera recognition worker.

The services share the same PostgreSQL database.

## Prerequisites

- Node.js 20.9 or newer
- Python 3.10 or newer (3.11 or 3.12 is recommended for the widest wheel support)
- PostgreSQL 17
- FFmpeg on `PATH` for RTSP camera processing

Install FFmpeg on Windows, then open a new terminal:

```powershell
winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
ffmpeg -version
```

## First-time setup

Run commands from this repository's root.

### 1. Configure local environment files

```powershell
Copy-Item .\Frontend\.env.example .\Frontend\.env.local
Copy-Item .\AI-Recognition-Service\.env.example .\AI-Recognition-Service\.env
```

Edit both files:

- Use the same `DB_*` values.
- Use the same `AI_SERVICE_API_KEY`.
- Use the same `CREDENTIAL_ENCRYPTION_KEY`.
- Replace every placeholder secret before deployment.

Local environment files and uploaded face images are ignored by Git.

### 2. Create a fresh database

The checked-in schema is the current baseline and already includes migrations
`001` through `015`. Do not replay those migrations after importing it.

```powershell
$pgBin = "C:\Program Files\PostgreSQL\17\bin"

& "$pgBin\psql.exe" -U postgres -c "CREATE DATABASE ai_attendance_db;"
& "$pgBin\psql.exe" -U postgres -d ai_attendance_db -f ".\Frontend\database\schema.sql"
& "$pgBin\psql.exe" -U postgres -d ai_attendance_db -f ".\Frontend\database\bootstrap-data.sql"
```

For an existing older database, apply only migrations it has not received:

```powershell
Set-Location .\Frontend
npm run db:migrate -- 015_attendance_checkout_motion_rules.sql
Set-Location ..
```

### 3. Install and seed the Frontend

```powershell
Set-Location .\Frontend
npm install
npm run db:seed
Set-Location ..
```

`db:seed` is intended for a new development database. It creates demo records
and resets these demo passwords:

- `admin` / `admin123`
- `manager1` / `manager123`
- `employee1` / `employee123`

Change or remove demo credentials before exposing the app to a network.

### 4. Install the AI service

```powershell
Set-Location .\AI-Recognition-Service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Set-Location ..
```

InsightFace downloads the `buffalo_l` model on first use (about 300 MB).

## Run locally

Terminal 1:

```powershell
Set-Location .\Frontend
npm run dev
```

Open `http://localhost:3000` and sign in. Add a location and camera, then
register employee face images before starting recognition.

Terminal 2:

```powershell
Set-Location .\AI-Recognition-Service
.\.venv\Scripts\Activate.ps1
python main.py --sync-embeddings
.\start-scan.ps1
```

Use `.\start-scan.ps1 -CameraId 1` to process one camera.

## Verification

```powershell
Set-Location .\Frontend
npm run lint
npm run build

Set-Location ..\AI-Recognition-Service
.\.venv\Scripts\python.exe -m compileall .
```

Full recognition requires at least one reachable RTSP camera and registered
employee faces. See `AI-Recognition-Service/DEPLOYMENT.md` for production and
troubleshooting details.
