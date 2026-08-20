# Starts the backend + frontend for LAN access, auto-detecting this
# machine's current Wi-Fi/Ethernet IPv4 (which changes since it's DHCP-assigned)
# and rewriting the 3 config files that need to know it.
#
# Usage: right-click > Run with PowerShell, or from a PowerShell prompt:
#   powershell -ExecutionPolicy Bypass -File .\start-lan.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $ip) {
    Write-Error "Could not detect a LAN IPv4 address. Check your network connection."
    exit 1
}

Write-Host "Detected LAN IP: $ip" -ForegroundColor Cyan

# --- Update config files to the current IP ---
$envLocal = Join-Path $root "frontend\.env.local"
(Get-Content $envLocal) -replace 'NEXT_PUBLIC_API_URL=http://[\d.]+:8000', "NEXT_PUBLIC_API_URL=http://${ip}:8000" |
    Set-Content $envLocal -Encoding utf8

$backendEnv = Join-Path $root "backend\.env"
(Get-Content $backendEnv) -replace 'CORS_ORIGINS=http://localhost:3000,http://[\d.]+:3000', "CORS_ORIGINS=http://localhost:3000,http://${ip}:3000" |
    Set-Content $backendEnv -Encoding utf8

$nextConfig = Join-Path $root "frontend\next.config.ts"
(Get-Content $nextConfig) -replace 'allowedDevOrigins: \["[\d.]+"\]', "allowedDevOrigins: [`"$ip`"]" |
    Set-Content $nextConfig -Encoding utf8

Write-Host "Config files updated." -ForegroundColor Cyan

# --- Start backend in its own window ---
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
)

# --- Start frontend in its own window ---
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Backend:  http://${ip}:8000" -ForegroundColor Green
Write-Host "Frontend: http://${ip}:3000  <- share this with other devices on the same Wi-Fi" -ForegroundColor Green
Write-Host "Local:    http://localhost:3000"
