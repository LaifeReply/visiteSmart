<#
.SYNOPSIS
    Avvia l'app Visite in locale: backend FastAPI in Docker (porta 8000) e frontend Vite (porta 5173).

.DESCRIPTION
    1. Avvia Docker Desktop se non e' gia' attivo e aspetta che risponda.
    2. Ricostruisce l'immagine del backend (cartella backend/) e ricrea il container "visite-api".
       I dati stanno nel volume "visite_data", quindi ricreare il container non perde nulla.
    3. Aspetta che il backend risponda su http://localhost:8000/visite.
    4. Avvia il frontend con "npm run dev" (installa le dipendenze se mancano).
       Se la porta 5173 e' gia' occupata, il frontend e' gia' attivo e non viene riavviato.

    Ctrl+C ferma il frontend; il backend resta attivo in Docker (per fermarlo: docker stop visite-api).

.PARAMETER NoBuild
    Non ricostruisce l'immagine del backend: riusa quella esistente (avvio piu' rapido se backend/ non e' cambiato).

.EXAMPLE
    .\start.ps1
    .\start.ps1 -NoBuild
#>
param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$BackendUrl = 'http://localhost:8000/visite'
$FrontendPort = 5173

function Write-Step([string]$text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

# docker scrive su stderr anche quando va tutto bene: in PowerShell 5.1 con ErrorActionPreference=Stop
# un redirect 2>$null diventerebbe un errore, quindi i controlli passano da cmd.
function Test-Docker { cmd /c "docker info >nul 2>&1"; return $LASTEXITCODE -eq 0 }

function Wait-Until([scriptblock]$condition, [int]$seconds, [string]$what) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (& $condition) { return }
        Start-Sleep -Seconds 2
    }
    throw "Timeout: $what non e' pronto dopo $seconds secondi."
}

# ---- 1. Docker
Write-Step 'Docker'
if (-not (Test-Docker)) {
    $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $dockerDesktop)) { throw "Docker non risponde e Docker Desktop non e' in $dockerDesktop." }
    Write-Host 'Docker Desktop non attivo: lo avvio...'
    Start-Process $dockerDesktop
    Wait-Until { Test-Docker } 180 'Docker'
}
Write-Host 'Docker pronto.'

# ---- 2. Backend
Write-Step 'Backend (container visite-api, porta 8000)'
if (-not $NoBuild) {
    docker build -t visite-api backend
    if ($LASTEXITCODE -ne 0) { throw 'docker build non riuscito.' }
}
cmd /c "docker rm -f visite-api >nul 2>&1"
docker run -d --name visite-api -p 8000:8000 -v visite_data:/data visite-api | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'docker run non riuscito (la porta 8000 e'' gia'' occupata?).' }

Wait-Until {
    try { (Invoke-WebRequest -Uri $BackendUrl -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false }
} 60 'il backend'
Write-Host "Backend pronto: $BackendUrl"

# ---- 3. Frontend
Write-Step "Frontend (Vite, porta $FrontendPort)"
if (Get-NetTCPConnection -LocalPort $FrontendPort -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Il frontend e' gia' attivo: http://localhost:$FrontendPort"
    return
}
if (-not (Test-Path 'node_modules')) {
    Write-Host 'Dipendenze mancanti: npm install...'
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install non riuscito.' }
}
Write-Host "Apri http://localhost:$FrontendPort  (Ctrl+C per fermare il frontend; il backend resta attivo)"
npm run dev
