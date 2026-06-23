# ViraEdit Setup Script — PowerShell version
# Run as: .\scripts\setup.ps1
# Or as admin: Start-Process powershell -Verb RunAs -ArgumentList "-File `"$PSScriptRoot\setup.ps1`""

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ViraEdit Setup for Windows" -ForegroundColor Cyan
Write-Host "  AI Video Editor for Nepali Creators" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ── PREREQUISITE CHECKS ─────────────────────────────────────
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow

$missing = @()

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $missing += "Node.js — install: winget install OpenJS.NodeJS.LTS"
} else {
    Write-Host "  [OK] Node.js $(node --version)" -ForegroundColor Green
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    $missing += "Python 3.11 — install: winget install Python.Python.3.11"
} else {
    Write-Host "  [OK] $(python --version)" -ForegroundColor Green
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $missing += "Docker Desktop — install: winget install Docker.DockerDesktop"
} else {
    Write-Host "  [OK] Docker $(docker --version)" -ForegroundColor Green
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    $missing += "FFmpeg — install: winget install Gyan.FFmpeg"
} else {
    Write-Host "  [OK] FFmpeg found" -ForegroundColor Green
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "[ERROR] Missing prerequisites:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Install the above, restart PowerShell, then run this script again." -ForegroundColor Yellow
    exit 1
}

# Check Docker is running
try {
    docker info 2>&1 | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not running. Start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Docker is running" -ForegroundColor Green
Write-Host ""

# ── ENV FILE ─────────────────────────────────────────────────
Write-Host "[2/7] Setting up environment..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  [OK] Created .env from .env.example" -ForegroundColor Green
    Write-Host "  [!]  IMPORTANT: Edit .env and add your GROQ_API_KEY" -ForegroundColor Yellow
    Write-Host "       Get a FREE key at: https://console.groq.com" -ForegroundColor Yellow
} else {
    Write-Host "  [OK] .env already exists" -ForegroundColor Green
}
Write-Host ""

# ── NODE DEPENDENCIES ────────────────────────────────────────
Write-Host "[3/7] Installing Node.js dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Node dependencies installed" -ForegroundColor Green
Write-Host ""

# ── PYTHON VIRTUAL ENVIRONMENT ───────────────────────────────
Write-Host "[4/7] Setting up Python environment..." -ForegroundColor Yellow
Set-Location "apps\api"
if (-not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "  [OK] Python venv created" -ForegroundColor Green
} else {
    Write-Host "  [OK] Python venv already exists" -ForegroundColor Green
}

& ".\venv\Scripts\Activate.ps1"
pip install --upgrade pip --quiet
if (Test-Path "requirements.txt") {
    pip install -r requirements.txt --quiet
    Write-Host "  [OK] Python dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  [!]  requirements.txt not found — will be created in EP-1.1" -ForegroundColor Yellow
}
Set-Location $Root
Write-Host ""

# ── DIRECTORIES ───────────────────────────────────────────────
Write-Host "[5/7] Creating directories..." -ForegroundColor Yellow
@("logs", "uploads", "renders") | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory $_ | Out-Null }
}
Write-Host "  [OK] Directories ready" -ForegroundColor Green
Write-Host ""

# ── DOCKER SERVICES ──────────────────────────────────────────
Write-Host "[6/7] Starting Docker services..." -ForegroundColor Yellow
if (Test-Path "infra\docker\docker-compose.yml") {
    docker compose -f infra\docker\docker-compose.yml up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker Compose failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Waiting 15 seconds for services to initialise..."
    Start-Sleep 15
    Write-Host "  [OK] Docker services started" -ForegroundColor Green
} else {
    Write-Host "  [!]  docker-compose.yml not found — will be created in EP-0.2" -ForegroundColor Yellow
}
Write-Host ""

# ── FONTS ────────────────────────────────────────────────────
Write-Host "[7/7] Installing Nepali fonts..." -ForegroundColor Yellow
& "$Root\scripts\install_fonts.bat"
Write-Host ""

# ── DONE ─────────────────────────────────────────────────────
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit .env and add your GROQ_API_KEY"
Write-Host "     (FREE key at: console.groq.com)"
Write-Host ""
Write-Host "  2. Start the app:"
Write-Host "     npm run dev"
Write-Host ""
Write-Host "  3. Open in browser:"
Write-Host "     http://localhost:3000"
Write-Host ""
Write-Host "  4. Start AI workers (new terminal):"
Write-Host "     scripts\start_workers.bat"
Write-Host ""
