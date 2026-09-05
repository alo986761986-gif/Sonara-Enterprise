import assert from "node:assert/strict";
import fs from "node:fs";

const API = String(process.env.API_ORIGIN || "https://api.sonaraenterprise.com").replace(/\/$/, "");
const WEB = String(process.env.WEB_ORIGIN || "https://sonaraenterprise.com").replace(/\/$/, "");
const SECRET = String(process.env.SONARA_INTERNAL_PROXY_SECRET || "").trim();
const REPORT_PATH = process.env.SONARA_SPEED_REPORT || "sonara-quality-speed-e2e-report.json";
const DURATION_SEC = Math.max(60, Number(process.env.SONARA_EXPECTED_DURATION_SEC || 180));
const MAX_LATENCY_MS = Math.max(30000, Number(process.env.SONARA_MAX_LATENCY_MS || 120000));
const POLL_MS = Math.max(750, Number(process.env.POLL_MS || 1000));
const READY_ATTEMPTS = Math.max(12, Number(process.env.READY_ATTEMPTS || 60));
const RUN_ID = "quality-speed-" + Date.now();
const report = {
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  requestedDurationSec: DURATION_SEC,
  maxLatencyMs: MAX_LATENCY_MS,
  readiness: null,
  jobId: null,
  latencyMs: null,
  audioUrls: [],
  measuredDurationsSec: [],
  submissionMetadata: null,
  terminalMetadata: null,
  ok: false
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
};
const headers = extra => ({
  "User-Agent": "SONARA-V14-Speed-Canary/1.0",
  ...(SECRET ? { "X-Sonara-Internal-Secret": SECRET } : {}),
  "X-Sonara-Profile-Id": "sonara-v14-speed-canary",
  "X-Sonara-Project-Id": RUN_ID,
  ...(extra || {})
});

async function json(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(Number(init.timeoutMs || 300000))
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error("Risposta non JSON HTTP " + response.status + ": " + raw.slice(0, 500)); }
  if (!allowed.includes(response.status)) {
    throw new Error("HTTP " + response.status + ": " + JSON.stringify(data).slice(0, 1200));
  }
  return data;
}

function statusOf(data) {
  const raw = String(data?.status || data?.state || data?.data?.status || data?.data?.state || "").toUpperCase();
  if (["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE", "FINISHED", "READY"].includes(raw)) return "COMPLETED";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(raw)) return "FAILED";
  return "PROCESSING";
}

function jobOf(data) {
  return data?.job || data?.data || data || {};
}

function audioUrls(data) {
  const job = jobOf(data);
  const out = [];
  const add = value => {
    const url = String(value || "").trim();
    if (/^https:\/\//i.test(url) && !out.includes(url)) out.push(url);
  };
  add(job.audioUrl);
  for (const key of ["candidates", "outputs"]) {
    for (const item of Array.isArray(job[key]) ? job[key] : []) add(item?.audioUrl || item?.url);
  }
  for (const url of Array.isArray(job.audioUrls) ? job.audioUrls : []) add(url);
  return out;
}

async function waitForV14() {
  let last = null;
  for (let attempt = 1; attempt <= READY_ATTEMPTS; attempt += 1) {
    try {
      last = await json(API + "/api/molab/ready?speedCanary=" + encodeURIComponent(RUN_ID + "-" + attempt), {
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        timeoutMs: 30000
      }, [200]);
      const ready =
        last?.ready === true &&
        last?.fidelityProfile === "sonara-fidelity-v14-single-batch-fast1-quality2" &&
        last?.defaultGenerationProfile === "quality" &&
        Number(last?.defaultInferenceSteps) === 2 &&
        last?.qualitySingleGpuBatch === true &&
        Number(last?.qualityCandidatesPerBatch) === 2 &&
        last?.qualityAutomaticRepair === false &&
        last?.speedRevision === "sonara-v14-quality-single-batch-1";
      if (ready) {
        report.readiness = last;
        save();
        return;
      }
      console.log("Attendo propagazione V14.1 (" + attempt + "/" + READY_ATTEMPTS + ")");
    } catch (error) {
      console.log("Readiness transitoria (" + attempt + "/" + READY_ATTEMPTS + "): " + String(error?.message || error));
    }
    await sleep(3000);
  }
  throw new Error("V14.1 non pronta: " + JSON.stringify(last).slice(0, 1500));
}

async function poll(jobId, startedAt) {
  const deadline = startedAt + Math.max(MAX_LATENCY_MS + 60000, 180000);
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const data = await json(WEB + "/api/music/job/" + encodeURIComponent(jobId) + "?speedCanary=" + Date.now(), {
      method: "GET",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      timeoutMs: 30000
    }, [200, 202]);
    const status = statusOf(data);
    const job = jobOf(data);
    const elapsedMs = Date.now() - startedAt;
    console.log("POLL " + attempt + " " + status + " " + Number(job.progress || data?.progress || 0) + "% " + elapsedMs + "ms");
    if (status === "FAILED") throw new Error("Generazione fallita: " + JSON.stringify(job.error || job.message || job).slice(0, 1600));
    if (status === "COMPLETED") return { data, job, elapsedMs };
    await sleep(POLL_MS);
  }
  throw new Error("Generazione non completata entro la finestra canary.");
}

async function verifyDurations(urls) {
  const data = await json(API + "/api/studio/quality-v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ audioUrls: urls, durationSec: DURATION_SEC, bpm: 118, key: "C Minor" }),
    timeoutMs: 300000
  }, [200, 202]);
  const reports = Array.isArray(data?.reports) ? data.reports : [];
  assert.equal(reports.length, 2, "L'analisi WAV deve misurare entrambi i brani.");
  const durations = reports.map(item => Number(item?.durationVerification?.actualDuration ?? item?.declaredDurationSec ?? 0));
  assert.ok(reports.every(item => item?.measuredFromRealWav === true), "Entrambi gli output devono essere WAV realmente misurati.");
  assert.ok(durations.every(value => Number.isFinite(value) && value >= DURATION_SEC * 0.9), "Uno dei due brani non raggiunge la durata completa richiesta.");
  return durations;
}

async function main() {
  try {
    await waitForV14();

    const generationStartedAt = Date.now();
    const submitted = await json(API + "/api/engine/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        title: "SONARA V14 Speed Canary",
        genreFamily: "Pop / Electronic",
        genre: "Electronic Pop",
        subgenre: "Melodic Synth Pop",
        mood: "Energetic, emotional, polished",
        rawPrompt: "Complete modern Italian melodic synth-pop song at exact 118 BPM in C minor. Strong hook, clear verse-pre-chorus-chorus structure, expressive lead vocal, punchy drums, warm bass, luminous synths, dynamic bridge, final chorus and deliberate ending.",
        prompt: "Complete modern Italian melodic synth-pop song at exact 118 BPM in C minor. Strong hook, clear verse-pre-chorus-chorus structure, expressive lead vocal, punchy drums, warm bass, luminous synths, dynamic bridge, final chorus and deliberate ending.",
        lyrics: "[Verse 1]\nCorro nella luce della città,\ncerco una strada che mi porterà.\n[Pre-Chorus]\nSento il ritmo salire con me.\n[Chorus]\nResta qui, questa notte è per noi,\noltre il rumore ritrovo chi sei.\n[Verse 2]\nCambiano i giorni ma il fuoco non va,\nseguo il respiro della libertà.\n[Bridge]\nSe cade il cielo lo alzeremo ancora.\n[Final Chorus]\nResta qui, questa notte è per noi,\noltre il rumore ritrovo chi sei.",
        vocalMode: "vocal",
        language: "Italian",
        bpm: 118,
        key: "C Minor",
        durationSec: DURATION_SEC,
        weirdness: 42,
        styleInfluence: 92,
        candidateCount: 2,
        candidate_count: 2,
        dualFast: true,
        generationProfileV3: "quality",
        sonaraMusicDirectorV3: "sonara-music-director-v3",
        projectId: RUN_ID,
        profileId: "sonara-v14-speed-canary"
      }),
      timeoutMs: 300000
    });

    const jobId = String(submitted?.jobId || submitted?.job_id || submitted?.id || "");
    assert.ok(jobId, "jobId mancante.");
    report.jobId = jobId;
    report.submissionMetadata = submitted?.metadata || null;
    const submitMeta = report.submissionMetadata || {};
    assert.equal(submitMeta.qualityFastBatch, true, "Quality deve usare il percorso batch rapido.");
    assert.equal(Number(submitMeta.candidateCount), 2, "Quality deve creare soltanto i due brani richiesti.");
    assert.equal(submitMeta.qualitySequentialSingleTakes, false, "I due brani non devono essere renderizzati in sequenza.");
    assert.equal(submitMeta.qualityBlockingWavAnalysis, false, "L'analisi WAV non deve bloccare la consegna.");
    assert.equal(submitMeta.automaticQualityRepair, false, "Quality non deve bloccare l'utente con una rigenerazione.");
    save();

    const done = await poll(jobId, generationStartedAt);
    report.latencyMs = done.elapsedMs;
    report.terminalMetadata = done.job?.metadata || done.data?.metadata || null;
    report.audioUrls = audioUrls(done.data).slice(0, 2);
    assert.equal(report.audioUrls.length, 2, "La generazione deve restituire esattamente due brani.");

    report.measuredDurationsSec = await verifyDurations(report.audioUrls);
    assert.ok(report.latencyMs < MAX_LATENCY_MS, "Latenza " + report.latencyMs + "ms sopra il limite " + MAX_LATENCY_MS + "ms.");
    report.ok = true;
    save();
    console.log("SONARA_V14_TWO_TRACK_SPEED=PASS");
    console.log(JSON.stringify({
      jobId: report.jobId,
      latencyMs: report.latencyMs,
      latencySeconds: Number((report.latencyMs / 1000).toFixed(2)),
      requestedDurationSec: DURATION_SEC,
      measuredDurationsSec: report.measuredDurationsSec,
      outputCount: report.audioUrls.length
    }, null, 2));
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.message : String(error);
    save();
    console.error("SONARA_V14_TWO_TRACK_SPEED=FAIL");
    console.error(report.error);
    process.exitCode = 1;
  }
}

await main();
