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

    $AceStepDir = $candidates | Where-Object {
        (Test-Path (Join-Path $_ "pyproject.toml")) -and
        (Test-Path (Join-Path $_ "start_api_server.bat"))
    } | Select-Object -First 1
}

if (-not $AceStepDir) {
    $AceStepDir = Join-Path $repoRoot "vendor\ACE-Step-1.5"
    $vendorDir = Split-Path -Parent $AceStepDir
    New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

    Write-Host "[SONARA] ACE-Step 1.5 not found. Cloning official repository..."
    git clone https://github.com/ace-step/ACE-Step-1.5.git $AceStepDir
}

$launcher = Join-Path $AceStepDir "start_api_server.bat"
if (-not (Test-Path $launcher)) {
    throw "Official ACE-Step API launcher not found: $launcher"
}

Write-Host "[SONARA] ACE-Step directory: $AceStepDir"
Write-Host "[SONARA] Starting official REST API on http://127.0.0.1:8001"
Write-Host "[SONARA] Keep this terminal open."
Write-Host ""

Set-Location $AceStepDir
& $launcher

if ($LASTEXITCODE -ne 0) {
    throw "ACE-Step API launcher exited with code $LASTEXITCODE"
}
