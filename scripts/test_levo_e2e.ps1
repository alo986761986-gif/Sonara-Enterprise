param(
    [Parameter(Mandatory=$true)]
    [string]$LeVoApiUrl,

    [string]$SonaraBaseUrl = "http://127.0.0.1:3000",
    [string]$Prompt = "underground tech house, punchy kick, rolling bassline, tight percussion, shuffled groove, hypnotic club energy, instrumental",
    [string]$Genre = "Tech House",
    [int]$Bpm = 126,
    [int]$DurationSec = 15,
    [int]$PollSeconds = 5,
    [int]$MaxMinutes = 12
)

$ErrorActionPreference = "Stop"

$LeVoApiUrl = $LeVoApiUrl.TrimEnd('/')
$SonaraBaseUrl = $SonaraBaseUrl.TrimEnd('/')

Write-Host "=== SONARA LEVO E2E ===" -ForegroundColor Cyan
Write-Host "LeVo:   $LeVoApiUrl"
Write-Host "Sonara: $SonaraBaseUrl"
Write-Host ""

Write-Host "[1/5] Checking LeVo bridge..." -ForegroundColor Yellow
$levoHealth = Invoke-RestMethod "$LeVoApiUrl/health" -TimeoutSec 15
if ($levoHealth.status -ne "healthy") {
    throw "LeVo bridge is not healthy: $($levoHealth | ConvertTo-Json -Compress)"
}
Write-Host "LeVo healthy." -ForegroundColor Green

Write-Host "[2/5] Checking Sonara..." -ForegroundColor Yellow
$sonaraHealth = Invoke-RestMethod "$SonaraBaseUrl/api/health" -TimeoutSec 10
if ($sonaraHealth.status -ne "HEALTHY") {
    throw "Sonara backend is not healthy."
}
Write-Host "Sonara healthy." -ForegroundColor Green

Write-Host "[3/5] Selecting LeVo engine..." -ForegroundColor Yellow
$selection = Invoke-RestMethod `
    -Method POST `
    -Uri "$SonaraBaseUrl/api/engine/select" `
    -ContentType "application/json" `
    -Body '{"engineId":"sonara_levo_v2"}'

if ($selection.status -ne "success") {
    throw "Could not select sonara_levo_v2."
}
Write-Host $selection.message -ForegroundColor Green

Write-Host "[4/5] Starting generation..." -ForegroundColor Yellow
$body = @{
    engineId = "sonara_levo_v2"
    prompt = $Prompt
    genre = $Genre
    mood = "Hypnotic"
    lyrics = ""
    bpm = $Bpm
    durationSec = $DurationSec
    title = "Sonara LeVo E2E Test"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Method POST `
    -Uri "$SonaraBaseUrl/api/engine/generate" `
    -ContentType "application/json" `
    -Body $body

$jobId = $response.jobId
if (-not $jobId) {
    throw "Sonara did not return a jobId."
}

Write-Host "Job: $jobId" -ForegroundColor Cyan
Write-Host "Engine: $($response.engine)"

Write-Host "[5/5] Waiting for completion..." -ForegroundColor Yellow
$deadline = (Get-Date).AddMinutes($MaxMinutes)
$job = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $PollSeconds

    try {
        $job = Invoke-RestMethod "$SonaraBaseUrl/api/music/job/$jobId" -TimeoutSec 10
    } catch {
        $allJobs = Invoke-RestMethod "$SonaraBaseUrl/api/music/jobs" -TimeoutSec 10
        $job = $allJobs.jobs | Where-Object { $_.jobId -eq $jobId } | Select-Object -First 1
    }

    if (-not $job) {
        Write-Host "Job not visible yet..."
        continue
    }

    $status = [string]$job.status
    $progress = [int]($job.progress | ForEach-Object { if ($_ -ne $null) { $_ } else { 0 } })
    $stage = [string]$job.metadata.currentStage

    Write-Host "$(Get-Date -Format HH:mm:ss)  $status  $progress%  $stage"

    if ($status -eq "COMPLETED") {
        if (-not $job.audioUrl) {
            throw "Job completed but audioUrl is missing."
        }

        $audioUrl = if ($job.audioUrl.StartsWith("http")) {
            $job.audioUrl
        } else {
            "$SonaraBaseUrl$($job.audioUrl)"
        }

        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "SONARA -> LEVO: SUCCESS" -ForegroundColor Green
        Write-Host "AUDIO: $audioUrl" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green

        Start-Process $audioUrl
        exit 0
    }

    if ($status -eq "FAILED") {
        $detail = $job.metadata.error
        if (-not $detail) { $detail = $job.error }
        throw "Generation failed: $detail"
    }
}

throw "Timed out after $MaxMinutes minutes waiting for job $jobId."
