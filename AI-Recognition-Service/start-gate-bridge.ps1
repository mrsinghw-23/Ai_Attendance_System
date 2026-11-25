param(
    [Parameter(Mandatory = $true)]
    [string]$RtspUrl,

    [Parameter(Mandatory = $true)]
    [string]$GatewayId
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

Write-Host "Starting multithreaded RTSP -> gate-scan bridge..."
python .\rtsp_gate_scan_poster.py --rtsp-url $RtspUrl --gateway-id $GatewayId
