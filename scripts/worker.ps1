# ViraEdit Celery Worker — PowerShell
# CRITICAL: --pool=solo required on Windows (no fork support)
#
# Usage:
#   .\scripts\worker.ps1             — transcription queue only
#   .\scripts\worker.ps1 -Queue all  — all queues

param(
    [string]$Queue = "transcription"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApiDir = Join-Path $ScriptDir "..\apps\api"

Write-Host "Starting ViraEdit Celery Worker..." -ForegroundColor Cyan
Write-Host "Pool: solo (Windows-compatible)" -ForegroundColor Yellow
Write-Host "API dir: $ApiDir"
Write-Host ""

Set-Location $ApiDir

if ($Queue -eq "all") {
    Write-Host "Queues: transcription, analysis, render, default" -ForegroundColor Green
    & ".\.venv\Scripts\celery.exe" -A celery_app worker `
        --pool=solo `
        --loglevel=info `
        --queues=transcription,analysis,render,default `
        "--hostname=worker@%h"
} else {
    Write-Host "Queue: $Queue" -ForegroundColor Green
    & ".\.venv\Scripts\celery.exe" -A celery_app worker `
        --pool=solo `
        --loglevel=info `
        "--queues=$Queue" `
        "--hostname=$Queue-worker@%h"
}
