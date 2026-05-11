$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$escapedRoot = [regex]::Escape($root)

foreach ($port in (8000..8020) + (5173..5193)) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -ne 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
}

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

Write-Host "Stopped MCI Concord exhibition services."
