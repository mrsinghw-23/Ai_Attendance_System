# Start AI face scanning for attendance (CP Plus / NVR RTSP CCTV cameras)
param(
    [int]$CameraId = 0
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv\Scripts\Activate.ps1")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
} else {
    .\.venv\Scripts\Activate.ps1
}

Write-Host "Syncing face embeddings from registered employees..."
python main.py --sync-embeddings

Write-Host "Applying motion-trigger + employee-only mode..."
python set_motion_employee_mode.py

if ($CameraId -gt 0) {
    Write-Host "Starting AI scan on camera $CameraId ..."
    python main.py --camera-id $CameraId
} else {
    Write-Host "Starting AI scan on all active cameras..."
    python main.py
}
