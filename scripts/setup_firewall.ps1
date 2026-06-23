# ViraEdit - Windows Firewall Setup
# Opens inbound ports for all ViraEdit services.
# Run as Administrator once after initial setup.
#
# Usage (elevated PowerShell):
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#   .\scripts\setup_firewall.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "ViraEdit - Windows Firewall Configuration" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    Write-Host "[ERROR] This script must run as Administrator." -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> Run as administrator" -ForegroundColor Yellow
    Write-Host "  Then run: .\scripts\setup_firewall.ps1" -ForegroundColor Yellow
    exit 1
}

$rules = @(
    @{ Port = 3000;  Name = "ViraEdit Frontend (Next.js)";      Description = "ViraEdit web app" },
    @{ Port = 8000;  Name = "ViraEdit API (FastAPI)";            Description = "ViraEdit backend API" },
    @{ Port = 5432;  Name = "ViraEdit PostgreSQL";               Description = "ViraEdit database" },
    @{ Port = 6379;  Name = "ViraEdit Redis";                    Description = "ViraEdit queue and cache" },
    @{ Port = 9000;  Name = "ViraEdit MinIO S3";                 Description = "ViraEdit object storage" },
    @{ Port = 9001;  Name = "ViraEdit MinIO Console";            Description = "ViraEdit storage console" }
)

foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  [SKIP] Port $($rule.Port) - rule already exists: $($rule.Name)" -ForegroundColor Yellow
    } else {
        try {
            New-NetFirewallRule `
                -DisplayName $rule.Name `
                -Description $rule.Description `
                -Direction Inbound `
                -Protocol TCP `
                -LocalPort $rule.Port `
                -Action Allow `
                -Profile Any `
                -ErrorAction Stop | Out-Null
            Write-Host "  [OK]   Port $($rule.Port) - $($rule.Name)" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Port $($rule.Port) - could not add rule: $_" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Firewall configuration complete." -ForegroundColor Green
Write-Host "Ports 3000, 8000, 5432, 6379, 9000, 9001 are now open." -ForegroundColor Cyan
Write-Host ""
Write-Host "To remove all ViraEdit firewall rules:" -ForegroundColor Gray
Write-Host '  Get-NetFirewallRule -DisplayName "ViraEdit*" | Remove-NetFirewallRule' -ForegroundColor Gray
Write-Host ""
