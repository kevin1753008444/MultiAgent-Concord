$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-PortOpen {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -First 1
    return $null -ne $connection
}

function Get-FreePort {
    param(
        [int]$StartPort,
        [int]$MaxAttempts = 20
    )

    for ($port = $StartPort; $port -lt ($StartPort + $MaxAttempts); $port++) {
        if (-not (Test-PortOpen -Port $port)) {
            return $port
        }
    }

    throw "No free port found from $StartPort to $($StartPort + $MaxAttempts - 1)."
}

function Get-BrowserPath {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

function Wait-PortOpen {
    param([int]$Port)

    for ($i = 0; $i -lt 60; $i++) {
        if (Test-PortOpen -Port $Port) {
            return
        }
        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for port $Port."
}

function Open-AdminWindow {
    param([int]$Port)

    $browser = Get-BrowserPath
    $url = "http://127.0.0.1:$Port/"
    $browserProfile = Join-Path $root ".exhibition-browser-profile"

    if ($browser) {
        Start-Process $browser -ArgumentList @(
            "--new-window",
            "--app=$url",
            "--user-data-dir=$browserProfile",
            "--no-first-run",
            "--autoplay-policy=no-user-gesture-required"
        )
    } else {
        Start-Process $url
    }
}

function Stop-ExistingServices {
    foreach ($port in (8000..8020) + (5173..5193)) {
        Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -ne 0 } |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object {
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            }
    }

    $escapedRoot = [regex]::Escape($root)
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -match "backend.main:app" -or
            ($_.CommandLine -match $escapedRoot -and
                ($_.CommandLine -match "vite" -or
                 $_.CommandLine -match "npm run dev"))
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    Start-Sleep -Seconds 2
}

if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env not found." -ForegroundColor Red
    Write-Host "Copy .env.example to .env and fill in your API keys."
    exit 1
}

Write-Host "Clearing any previous exhibition services..."
Stop-ExistingServices
Remove-Item -Path ".\backend-dev.log", ".\backend-dev.err.log", ".\frontend-dev.log", ".\frontend-dev.err.log" -Force -ErrorAction SilentlyContinue
$backendPort = Get-FreePort -StartPort 8000
$frontendPort = Get-FreePort -StartPort 5173
$env:BACKEND_PORT = "$backendPort"

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv .venv
}

Write-Host "Installing backend dependencies if needed..."
& ".\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..."
    Push-Location frontend
    npm install
    Pop-Location
}

Write-Host "Starting backend at http://127.0.0.1:$backendPort ..."
$backendJob = Start-Job -Name "MCI Concord Backend" -ArgumentList $root, $backendPort -ScriptBlock {
    param($Root, $Port)
    Set-Location $Root
    & "$Root\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port $Port *> "$Root\backend-dev.log"
}

Write-Host "Starting frontend at http://127.0.0.1:$frontendPort ..."
$frontendJob = Start-Job -Name "MCI Concord Frontend" -ArgumentList $root, $backendPort, $frontendPort -ScriptBlock {
    param($Root, $BackendPort, $FrontendPort)
    $env:BACKEND_PORT = "$BackendPort"
    Set-Location "$Root\frontend"
    & npm.cmd run dev -- --host 127.0.0.1 --port $FrontendPort *> "$Root\frontend-dev.log"
}

try {
    Write-Host "Waiting for services..."
    Wait-PortOpen -Port $backendPort
    Wait-PortOpen -Port $frontendPort

    Open-AdminWindow -Port $frontendPort

    Write-Host ""
    Write-Host "MCI Concord control console is ready." -ForegroundColor Green
    Write-Host "Admin:    http://127.0.0.1:$frontendPort"
    Write-Host "Backend:  http://127.0.0.1:$backendPort/health"
    Write-Host ""
    Write-Host "Use the Admin button to open the three projection windows."
    Write-Host "Press Ctrl+C, press Q, or close this console window to stop frontend/backend."
    Write-Host "Logs: backend-dev.log, frontend-dev.log"
    Write-Host ""

    while ($true) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq "Q") {
                break
            }
        }
        Start-Sleep -Milliseconds 250
    }
}
finally {
    Write-Host "Stopping MCI Concord services..."
    Stop-Job -Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
    Stop-ExistingServices
}
