param(
    [string]$AceStepDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $AceStepDir) {
    $candidates = @(
        (Join-Path $repoRoot "vendor\ACE-Step-1.5"),
        (Join-Path $env:USERPROFILE "Desktop\ACE-Step-1.5"),
        (Join-Path $env:USERPROFILE "ACE-Step-1.5")
    )

    $AceStepDir = $candidates | Where-Object { Test-Path (Join-Path $_ "pyproject.toml") } | Select-Object -First 1
}

if (-not $AceStepDir) {
    $AceStepDir = Join-Path $repoRoot "vendor\ACE-Step-1.5"
    $vendorDir = Split-Path -Parent $AceStepDir
    New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

    Write-Host "[SONARA] ACE-Step 1.5 not found. Cloning official repository..."
    git clone https://github.com/ace-step/ACE-Step-1.5.git $AceStepDir
}

if (-not (Test-Path (Join-Path $AceStepDir "pyproject.toml"))) {
    throw "ACE-Step directory is invalid: $AceStepDir"
}

Write-Host "[SONARA] ACE-Step directory: $AceStepDir"
Set-Location $AceStepDir

$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    $localUv = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
    if (Test-Path $localUv) {
        $env:PATH = "$(Split-Path $localUv -Parent);$env:PATH"
        $uv = Get-Command uv -ErrorAction SilentlyContinue
    }
}

if (-not $uv) {
    Write-Host "[SONARA] Installing uv with ACE-Step official installer..."
    $installUv = Join-Path $AceStepDir "install_uv.bat"
    if (Test-Path $installUv) {
        & $installUv --silent
        $localUv = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
        if (Test-Path $localUv) {
            $env:PATH = "$(Split-Path $localUv -Parent);$env:PATH"
        }
    }
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is not available. Install it and rerun this script."
}

Write-Host "[SONARA] Starting official ACE-Step 1.5 REST API on http://127.0.0.1:8001"
Write-Host "[SONARA] Keep this terminal open."
Write-Host ""

$env:ACESTEP_API_HOST = "127.0.0.1"
$env:ACESTEP_API_PORT = "8001"

uv run acestep-api
