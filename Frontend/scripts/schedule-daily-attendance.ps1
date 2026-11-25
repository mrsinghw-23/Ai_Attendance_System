# Windows Task Scheduler helper — run attendance engine + daily reports at end of day.
# Example (run PowerShell as Administrator):
#
#   $action = New-ScheduledTaskAction -Execute "powershell.exe" `
#     -Argument "-NoProfile -ExecutionPolicy Bypass -File `"E:\AI-Atten-Sytem\Frontend\scripts\schedule-daily-attendance.ps1`""
#   $trigger = New-ScheduledTaskTrigger -Daily -At "11:30PM"
#   Register-ScheduledTask -TaskName "AI-Attendance-Daily" -Action $action -Trigger $trigger `
#     -Description "Finalize attendance and export daily reports"

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "[1/2] Running attendance engine..."
node .\process-attendance-engine.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/2] Generating daily reports..."
node .\generate-daily-reports.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Daily attendance tasks completed."
