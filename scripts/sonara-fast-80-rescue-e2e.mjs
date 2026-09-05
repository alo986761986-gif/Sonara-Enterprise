const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function jsonRequest(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 120000)) });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`); }
  if (!allowed.includes(response.status)) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  return data;
}

const prompt = 'Professional Tribal House instrumental, 124 BPM, A minor, punchy kick, deep bass, organic congas, bongos, djembes, shakers, warm club mix, smooth highs, concise arrangement.';

const submit = await jsonRequest(`${API}/api/engine/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
  body: JSON.stringify({
    title: 'SONARA Fast 80 Rescue Canary',
    genreFamily: 'Electronic / Dance',
    genre: 'House',
    subgenre: 'Tribal House',
    prompt,
    rawPrompt: prompt,
    vocalMode: 'instrumental',
    bpm: 124,
    key: 'A Minor',
    durationSec: 30,
    weirdness: 30,
    styleInfluence: 90,
    generationProfileV3: 'fast',
    renderProfile: 'fast',
    sonaraFast80RescueCanary: true
  })
});

const jobId = String(submit?.jobId || submit?.job_id || '');
if (!jobId) throw new Error(`jobId mancante: ${JSON.stringify(submit).slice(0, 800)}`);
console.log(`FAST_80_JOB_ID=${jobId}`);

let lastProgress = -1;
let repeated80Band = 0;
let maxRepeated80Band = 0;

for (let attempt = 1; attempt <= 60; attempt++) {
  let job;
  try {
    const raw = await jsonRequest(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?f80=${attempt}-${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      timeoutMs: 45000
    });
    job = raw?.job || raw?.data || raw || {};
  } catch (error) {
    console.log(`FAST_80_POLL_${attempt}=TRANSIENT ${error.message}`);
    await sleep(2000);
    continue;
  }

  const status = String(job.status || '').toUpperCase();
  const progress = Number(job.progress || 0);
  const stage = String(job.stage || job.metadata?.currentStage || '');
  console.log(`FAST_80_POLL_${attempt}=${status} ${progress}% ${stage}`);

  const in80Band = progress >= 75 && progress <= 85;
  if (in80Band && Math.abs(progress - lastProgress) < 0.05) repeated80Band += 1;
  else repeated80Band = in80Band ? 1 : 0;
  maxRepeated80Band = Math.max(maxRepeated80Band, repeated80Band);
  lastProgress = progress;

  if (maxRepeated80Band >= 8) throw new Error(`FAST_STILL_STUCK_AROUND_80 repeated=${maxRepeated80Band} progress=${progress}`);

  if (['FAILED', 'ERROR', 'CANCELLED'].includes(status)) {
    throw new Error(`FAST_FAILED: ${JSON.stringify(job).slice(0, 1600)}`);
  }

  if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(status)) {
    const urls = [job.audioUrl, ...(job.audioUrls || []), ...(job.candidates || []).map(x => x?.audioUrl || x?.url)].filter(Boolean);
    if (!urls.length) throw new Error('FAST_COMPLETED_WITHOUT_AUDIO');
    const steps = Number(job.metadata?.inferenceSteps || job.candidates?.[0]?.inferenceSteps || 1);
    if (steps !== 1) throw new Error(`FAST_INFERENCE_STEPS_CHANGED steps=${steps}`);
    console.log(`SONARA_FAST_80_RESCUE_LIVE=PASS maxRepeated80=${maxRepeated80Band} audioCount=${new Set(urls).size} inferenceSteps=${steps}`);
    process.exit(0);
  }

  await sleep(2000);
}

throw new Error(`FAST_80_RESCUE_TIMEOUT maxRepeated80=${maxRepeated80Band}`);
