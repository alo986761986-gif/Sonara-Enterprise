import crypto from 'node:crypto';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function jsonRequest(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 120000)) });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`); }
  if (!allowed.includes(response.status)) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  return data;
}

async function audioFingerprint(url) {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-262143', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(60000)
  });
  if (![200, 206].includes(response.status)) throw new Error(`audio HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 4096) throw new Error(`audio troppo corto: ${bytes.length}`);
  return {
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

const prompt = 'Professional Tribal House instrumental, 124 BPM, A minor, deep rounded bass, organic congas and bongos, djembes and shakers, hypnotic groove, warm club mix, smooth highs, rich natural percussion, memorable hook, restrained transitions, no harshness.';

const submit = await jsonRequest(`${API}/api/engine/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
  body: JSON.stringify({
    title: 'SONARA Quality AB Diversity Canary',
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
    weirdness: 48,
    styleInfluence: 92,
    generationProfileV3: 'quality',
    renderProfile: 'quality',
    candidateCount: 2,
    sonaraQualityABDiversificationCanary: true
  })
});

const jobId = String(submit?.jobId || submit?.job_id || '');
if (!jobId) throw new Error(`jobId mancante: ${JSON.stringify(submit).slice(0,800)}`);
console.log(`QUALITY_AB_JOB_ID=${jobId}`);

for (let attempt = 1; attempt <= 90; attempt++) {
  let raw;
  try {
    raw = await jsonRequest(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?qab=${attempt}-${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      timeoutMs: 45000
    });
  } catch (error) {
    console.log(`QUALITY_AB_POLL_${attempt}=TRANSIENT ${error.message}`);
    await sleep(2500);
    continue;
  }
  const job = raw?.job || raw?.data || raw || {};
  const status = String(job.status || '').toUpperCase();
  const progress = Number(job.progress || 0);
  const stage = String(job.stage || job.metadata?.currentStage || '');
  console.log(`QUALITY_AB_POLL_${attempt}=${status} ${progress}% ${stage}`);

  if (['FAILED','ERROR','CANCELLED'].includes(status)) throw new Error(`QUALITY_AB_FAILED ${JSON.stringify(job).slice(0,1800)}`);
  if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(status)) {
    const candidates = Array.isArray(job.candidates) ? job.candidates : [];
    const urls = [job.audioUrl, ...(job.audioUrls || []), ...candidates.map(x => x?.audioUrl || x?.url)].filter(Boolean);
    const uniqueUrls = [...new Set(urls)].slice(0,2);
    if (uniqueUrls.length !== 2) throw new Error(`QUALITY_AB_NEEDS_TWO_DISTINCT_URLS ${JSON.stringify(job).slice(0,1800)}`);

    const [a, b] = await Promise.all(uniqueUrls.map(audioFingerprint));
    if (a.sha256 === b.sha256) throw new Error(`QUALITY_AB_AUDIO_BYTES_IDENTICAL sha256=${a.sha256}`);

    const meta = job.metadata || {};
    if (Number(meta.inferenceSteps || candidates[0]?.inferenceSteps || 2) !== 2) throw new Error(`QUALITY_AB_WRONG_STEPS ${JSON.stringify(meta).slice(0,800)}`);
    if (meta.qualityABIndependentCompositionV8 !== true) throw new Error(`QUALITY_AB_V8_MARKER_MISSING ${JSON.stringify(meta).slice(0,1000)}`);

    console.log(`SONARA_QUALITY_AB_DIVERSITY_LIVE=PASS audioCount=2 hashA=${a.sha256.slice(0,12)} hashB=${b.sha256.slice(0,12)} inferenceSteps=2`);
    process.exit(0);
  }
  await sleep(2500);
}

throw new Error('QUALITY_AB_DIVERSITY_TIMEOUT');
