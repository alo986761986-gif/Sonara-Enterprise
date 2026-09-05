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

const prompt = 'Professional Tribal House instrumental, 124 BPM, A minor, warm punchy kick, deep rounded bass, organic congas and bongos, djembes, shakers, subtle tribal chants as texture only, smooth top end, rich but natural percussion, restrained transitions, no harsh highs, release-ready club mix.';

const submit = await jsonRequest(`${API}/api/engine/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
  body: JSON.stringify({
    title: 'SONARA Quality 47 Rescue Canary',
    genreFamily: 'Electronic / Dance',
    genre: 'House',
    subgenre: 'Tribal House',
    mood: 'Hypnotic',
    prompt,
    rawPrompt: prompt,
    vocalMode: 'instrumental',
    bpm: 124,
    key: 'A Minor',
    durationSec: 30,
    weirdness: 35,
    styleInfluence: 92,
    generationProfileV3: 'quality',
    renderProfile: 'quality',
    sonaraQuality47RescueCanary: true
  })
});

const jobId = String(submit?.jobId || submit?.job_id || '');
if (!jobId) throw new Error(`jobId mancante: ${JSON.stringify(submit).slice(0, 800)}`);
console.log(`QUALITY_47_JOB_ID=${jobId}`);

let repeated474 = 0;
let maxRepeated474 = 0;
let lastProgress = -1;
let repeatedHigh = 0;
let maxRepeatedHigh = 0;

for (let attempt = 1; attempt <= 70; attempt++) {
  let job;
  try {
    const raw = await jsonRequest(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?q47=${attempt}-${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      timeoutMs: 45000
    });
    job = raw?.job || raw?.data || raw || {};
  } catch (error) {
    console.log(`QUALITY_47_POLL_${attempt}=TRANSIENT ${error.message}`);
    await sleep(2500);
    continue;
  }

  const status = String(job.status || '').toUpperCase();
  const progress = Number(job.progress || 0);
  const stage = String(job.stage || job.metadata?.currentStage || '');
  console.log(`QUALITY_47_POLL_${attempt}=${status} ${progress}% ${stage}`);

  if (Math.abs(progress - 47.4) < 0.05) repeated474 += 1;
  else repeated474 = 0;
  maxRepeated474 = Math.max(maxRepeated474, repeated474);

  if (progress >= 45 && progress < 50 && Math.abs(progress - lastProgress) < 0.05) repeatedHigh += 1;
  else repeatedHigh = 1;
  maxRepeatedHigh = Math.max(maxRepeatedHigh, repeatedHigh);
  lastProgress = progress;

  if (maxRepeated474 >= 7) throw new Error(`QUALITY_STILL_STUCK_AT_47_4 repeated=${maxRepeated474}`);
  if (maxRepeatedHigh >= 12) throw new Error(`QUALITY_STILL_STALLED_MIDPOINT progress=${progress} repeated=${maxRepeatedHigh}`);

  if (['FAILED', 'ERROR', 'CANCELLED'].includes(status)) {
    const text = JSON.stringify(job).slice(0, 1600);
    if (/47\.4|anti-stallo finale|rimasto fermo/i.test(text)) {
      throw new Error(`QUALITY_RESCUE_FAILED_INSTEAD_OF_COMPLETING: ${text}`);
    }
    throw new Error(`QUALITY_FAILED: ${text}`);
  }

  if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(status)) {
    const urls = [job.audioUrl, ...(job.audioUrls || []), ...(job.candidates || []).map(x => x?.audioUrl || x?.url)].filter(Boolean);
    if (!urls.length) throw new Error('QUALITY_COMPLETED_WITHOUT_AUDIO');
    console.log(`SONARA_QUALITY_47_RESCUE_LIVE=PASS maxRepeated47_4=${maxRepeated474} maxRepeatedMid=${maxRepeatedHigh} audioCount=${new Set(urls).size}`);
    process.exit(0);
  }

  await sleep(2500);
}

throw new Error(`QUALITY_47_RESCUE_TIMEOUT maxRepeated47_4=${maxRepeated474} maxRepeatedMid=${maxRepeatedHigh}`);
