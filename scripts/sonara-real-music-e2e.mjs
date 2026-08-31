import fs from 'node:fs';

const API_ORIGIN = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB_ORIGIN = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const INTERNAL_SECRET = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
const STRICT_RELEASE_GATE = /^(1|true|yes)$/i.test(String(process.env.STRICT_RELEASE_GATE || ''));
const POLL_MS = Math.max(1500, Number(process.env.POLL_MS || 5000));
const MAX_POLLS = Math.max(20, Number(process.env.MAX_POLLS || 140));
const PROJECT_ID = `production-canary-${Date.now()}`;
const PROFILE_ID = 'sonara-production-canary';
const REPORT_PATH = process.env.SONARA_E2E_REPORT || 'sonara-real-music-e2e-report.json';

const report = {
  startedAt: new Date().toISOString(),
  apiOrigin: API_ORIGIN,
  webOrigin: WEB_ORIGIN,
  projectId: PROJECT_ID,
  strictReleaseGate: STRICT_RELEASE_GATE,
  stages: [],
  outputs: {},
  quality: {},
  diagnostics: []
};

function stage(name, data = {}) {
  const entry = { name, at: new Date().toISOString(), ...data };
  report.stages.push(entry);
  console.log(`\n=== ${name} ===`);
  if (Object.keys(data).length) console.log(JSON.stringify(data, null, 2));
  return entry;
}

function saveReport() {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function secretHeaders(extra = {}) {
  return {
    ...(INTERNAL_SECRET ? { 'X-Sonara-Internal-Secret': INTERNAL_SECRET } : {}),
    'X-Sonara-Profile-Id': PROFILE_ID,
    'X-Sonara-Project-Id': PROJECT_ID,
    ...extra
  };
}

async function jsonRequest(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(Number(init.timeoutMs || 300_000))
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch {
    throw new Error(`${init.label || url}: non-JSON response HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  if (!allowed.includes(response.status)) {
    throw new Error(`${init.label || url}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 900)}`);
  }
  return { response, data };
}

function normalizeStatus(data) {
  return String(data?.status || data?.job?.status || data?.data?.status || '').toUpperCase();
}

function normalizeJob(data) {
  return data?.job || data?.data || data || {};
}

function audioUrlsFrom(data) {
  const job = normalizeJob(data);
  const urls = [];
  const push = value => {
    const text = String(value || '').trim();
    if (text && /^https:\/\//i.test(text) && !urls.includes(text)) urls.push(text);
  };
  push(job.audioUrl);
  for (const value of Array.isArray(job.audioUrls) ? job.audioUrls : []) push(value);
  for (const candidate of Array.isArray(job.candidates) ? job.candidates : []) push(candidate?.audioUrl);
  for (const output of Array.isArray(job.outputs) ? job.outputs : []) push(output?.audioUrl || output?.url);
  return urls;
}

async function pollJob({ jobId, pollUrl, label, publicMusicJob = false }) {
  if (!jobId) throw new Error(`${label}: jobId missing.`);
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const url = pollUrl
      ? new URL(pollUrl, API_ORIGIN).toString()
      : publicMusicJob
        ? `${WEB_ORIGIN}/api/music/job/${encodeURIComponent(jobId)}?canary=${attempt}-${Date.now()}`
        : `${API_ORIGIN}/api/studio/job/${encodeURIComponent(jobId)}?canary=${attempt}-${Date.now()}`;
    const headers = publicMusicJob
      ? { 'Cache-Control': 'no-cache' }
      : secretHeaders({ 'Cache-Control': 'no-cache' });
    let data;
    try {
      ({ data } = await jsonRequest(url, { method: 'GET', headers, label: `${label} poll` }, [200, 202]));
    } catch (error) {
      console.log(`${label} poll ${attempt}/${MAX_POLLS}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(POLL_MS);
      continue;
    }
    const job = normalizeJob(data);
    const status = normalizeStatus(data);
    const progress = Number(job.progress ?? 0);
    console.log(`${label} poll ${attempt}/${MAX_POLLS}: ${status || 'UNKNOWN'} ${Number.isFinite(progress) ? `${progress}%` : ''}`);
    if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'DONE') return job;
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(`${label}: ${status}: ${JSON.stringify(job.error || job.message || job).slice(0, 1000)}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: timed out after ${MAX_POLLS} polls.`);
}

async function submitEngineGeneration() {
  stage('01 real A/B generation submit');
  const payload = {
    title: 'SONARA Studio 2.0 Real E2E Canary',
    genreFamily: 'Electronic / Dance',
    genre: 'House',
    subgenre: 'Deep House',
    mood: 'Deep, dark, emotional, hypnotic, elegant, late-night',
    rawPrompt: 'Professional deep house instrumental. Exact 122 BPM in A minor. Deep controlled sub bass, rounded club kick, crisp restrained percussion, warm analog minor chords, subtle dub echoes, evolving nocturnal pads, memorable understated motif, tension and release, polished stereo depth, clean transients, deliberate ending. No vocals. Avoid generic EDM and avoid pop song structure.',
    prompt: 'Professional deep house instrumental. Exact 122 BPM in A minor. Deep controlled sub bass, rounded club kick, crisp restrained percussion, warm analog minor chords, subtle dub echoes, evolving nocturnal pads, memorable understated motif, tension and release, polished stereo depth, clean transients, deliberate ending. No vocals. Avoid generic EDM and avoid pop song structure.',
    lyrics: '',
    vocalMode: 'instrumental',
    bpm: 122,
    key: 'A Minor',
    durationSec: 30,
    weirdness: 48,
    styleInfluence: 92,
    candidateCount: 2,
    dualFast: true,
    projectId: PROJECT_ID,
    profileId: PROFILE_ID,
    sonaraRealE2E: true
  };
  const { data } = await jsonRequest(`${API_ORIGIN}/api/engine/generate`, {
    method: 'POST',
    headers: secretHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    label: 'real generation submit'
  });
  const jobId = String(data?.jobId || '').trim();
  if (!jobId) throw new Error(`Real generation did not return a jobId: ${JSON.stringify(data).slice(0, 1000)}`);
  report.outputs.generationJobId = jobId;
  stage('02 real A/B generation poll', { jobId });
  const completed = await pollJob({ jobId, label: 'real generation', publicMusicJob: true });
  const urls = audioUrlsFrom(completed);
  if (urls.length < 2) throw new Error(`Expected two real A/B audio candidates, got ${urls.length}.`);
  report.outputs.generation = { jobId, audioUrls: urls.slice(0, 2), metadata: completed.metadata || null };
  stage('03 real A/B generation completed', { candidates: urls.slice(0, 2) });
  return urls.slice(0, 2);
}

async function qualityV2(audioUrls, label, requested = {}) {
  stage(`${label} Quality 2.0`);
  const { data } = await jsonRequest(`${API_ORIGIN}/api/studio/quality-v2`, {
    method: 'POST',
    headers: secretHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ audioUrls, bpm: requested.bpm ?? 122, key: requested.key ?? 'A Minor', durationSec: requested.durationSec ?? 30 }),
    label: `${label} quality`
  });
  const summary = data?.sonaraQualityDirector || {};
  const reports = Array.isArray(data?.reports) ? data.reports : [];
  if (!reports.length) throw new Error(`${label}: Quality 2.0 returned no real WAV reports.`);
  if (!reports.some(item => item?.measuredFromRealWav === true)) throw new Error(`${label}: no candidate was measured from a real WAV.`);
  const hardFailures = reports.flatMap(item => Array.isArray(item?.hardFailureReasons) ? item.hardFailureReasons : []);
  const fatal = hardFailures.filter(value => ['analysis-error', 'missing-real-wav', 'clipping', 'excessive-silence', 'dc-offset'].some(token => String(value).includes(token)));
  if (fatal.length) throw new Error(`${label}: hard audio-quality failure: ${[...new Set(fatal)].join(', ')}`);
  const bestScore = Number(summary.bestProfessionalScore ?? Math.max(...reports.map(item => Number(item?.professionalScore || 0))));
  const passed = Number(summary.passed || 0) > 0 || reports.some(item => item?.professionalReleasePassed === true);
  report.quality[label] = { bestScore, passed, summary, reports };
  console.log(`${label}: professional score ${bestScore}/100, release gate ${passed ? 'PASS' : 'REVIEW'}`);
  if (STRICT_RELEASE_GATE && !passed) throw new Error(`${label}: professional release gate 88 not passed.`);
  return { bestScore, passed, reports };
}

async function submitStudioOperation(operation, sourceAudioUrl, extra = {}) {
  stage(`${operation} submit`);
  const payload = {
    sourceAudioUrl,
    prompt: extra.prompt || '',
    bpm: extra.bpm ?? 122,
    key: extra.key ?? 'A Minor',
    start: extra.start,
    end: extra.end,
    durationSec: extra.durationSec ?? 30,
    projectId: PROJECT_ID,
    profileId: PROFILE_ID,
    sonaraRealE2E: true,
    ...extra.body
  };
  const { data } = await jsonRequest(`${API_ORIGIN}/api/studio/${operation}`, {
    method: 'POST',
    headers: secretHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
    label: `${operation} submit`
  });
  const jobId = String(data?.jobId || '').trim();
  if (!jobId) throw new Error(`${operation}: no jobId: ${JSON.stringify(data).slice(0, 900)}`);
  report.outputs[`${operation}JobId`] = jobId;
  const completed = await pollJob({ jobId, pollUrl: data?.pollUrl, label: operation });
  const urls = audioUrlsFrom(completed);
  if (!urls.length) throw new Error(`${operation}: completed without audio output.`);
  report.outputs[operation] = { jobId, audioUrls: urls, metadata: completed.metadata || null, qualityJudge: completed.qualityJudge || null };
  stage(`${operation} completed`, { jobId, outputs: urls.length });
  return { completed, audioUrls: urls };
}

async function verifyProjectMemory() {
  stage('project memory write/read');
  const headers = secretHeaders({ 'Content-Type': 'application/json' });
  const memoryPayload = {
    projectId: PROJECT_ID,
    profileId: PROFILE_ID,
    title: 'SONARA Studio 2.0 Real E2E Canary',
    family: 'Electronic / Dance',
    genre: 'House',
    subgenre: 'Deep House',
    atmosphere: 'Deep, dark, emotional, hypnotic, elegant, late-night',
    bpm: 122,
    key: 'A Minor',
    motif: 'Understated two-bar nocturnal analog motif with restrained syncopation',
    chorusIdentity: 'Instrumental main hook remains recognizable without pop chorus behavior',
    harmony: 'A-minor deep-house harmonic language with warm extended minor voicings',
    instrumentation: 'Club kick, controlled sub bass, restrained percussion, analog chords, dub echoes, nocturnal pads',
    arrangement: 'Intro -> groove development -> motif reveal -> tension -> main payoff -> deliberate ending',
    ending: 'Composed DJ-friendly resolution, no abrupt cut'
  };
  await jsonRequest(`${API_ORIGIN}/api/studio/project-memory`, {
    method: 'POST', headers, body: JSON.stringify(memoryPayload), label: 'project memory write'
  });
  const { data } = await jsonRequest(`${API_ORIGIN}/api/studio/project-memory?projectId=${encodeURIComponent(PROJECT_ID)}`, {
    method: 'GET', headers: secretHeaders(), label: 'project memory read'
  });
  const memory = data?.memory || {};
  if (Number(memory.bpm) !== 122 || String(memory.key || '') !== 'A Minor' || !String(memory.motif || '').includes('nocturnal')) {
    throw new Error(`Project memory did not preserve musical identity: ${JSON.stringify(memory).slice(0, 1200)}`);
  }
  report.outputs.projectMemory = memory;
}

async function main() {
  try {
    stage('00 release-status');
    const { data: release } = await jsonRequest(`${API_ORIGIN}/api/studio/release-status?canary=${Date.now()}`, {
      method: 'GET', headers: secretHeaders({ 'Cache-Control': 'no-cache' }), label: 'release status'
    });
    if (release?.studio?.maxStems !== 12 || release?.studio?.sessions !== '2.0') {
      throw new Error(`Unexpected Studio 2.0 release contract: ${JSON.stringify(release).slice(0, 1200)}`);
    }
    report.outputs.releaseStatus = release;

    await verifyProjectMemory();

    const [candidateA, candidateB] = await submitEngineGeneration();
    const baseQuality = await qualityV2([candidateA, candidateB], 'base-generation', { bpm: 122, key: 'A Minor', durationSec: 30 });
    const bestIndex = baseQuality.reports.reduce((best, item, index, array) => Number(item?.professionalScore || 0) > Number(array[best]?.professionalScore || 0) ? index : best, 0);
    const bestSource = [candidateA, candidateB][Math.min(bestIndex, 1)] || candidateA;
    report.outputs.bestBaseCandidate = bestSource;

    const replaced = await submitStudioOperation('replace', bestSource, {
      start: 8,
      end: 16,
      durationSec: 30,
      prompt: 'Keep the same Deep House song and all surrounding material. Inside 8-16 seconds only, make the percussion slightly more organic and detailed while preserving the kick, bass, chords, motif, BPM, key, ambience, singer state and loudness. Boundaries must be inaudible.'
    });
    await qualityV2([replaced.audioUrls[0]], 'replace', { bpm: 122, key: 'A Minor', durationSec: 30 });

    const extended = await submitStudioOperation('extend', replaced.audioUrls[0], {
      durationSec: 45,
      prompt: 'Extend naturally by about 15 seconds. Preserve Deep House identity, exact 122 BPM, A minor, motif memory, groove, instrumentation, sound palette and mastering character. Develop the motif once, then create a deliberate musical ending rather than a hard cut.'
    });
    await qualityV2([extended.audioUrls[0]], 'extend', { bpm: 122, key: 'A Minor', durationSec: 45 });

    const stems = await submitStudioOperation('stems-pro', bestSource, {
      durationSec: 30,
      prompt: 'Create professional time-aligned stems with minimum bleed and artifacts.',
      body: { stems: ['vocals','drums','bass','guitar','keys','synth','strings','brass','woodwinds','percussion','pads','fx'] }
    });
    if (stems.audioUrls.length < 2) {
      report.diagnostics.push(`Stems Pro returned ${stems.audioUrls.length} directly addressable audio URLs; inspect job metadata for bundled/multi-stem output.`);
    }

    report.ok = true;
    stage('FINAL PASS', {
      baseCandidates: 2,
      replace: 'completed',
      extend: 'completed',
      stemsProOutputs: stems.audioUrls.length,
      strictReleaseGate: STRICT_RELEASE_GATE
    });
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.stack || error.message : String(error);
    console.error('\nSONARA REAL MUSIC E2E FAILED\n', report.error);
    saveReport();
    process.exitCode = 1;
    return;
  }
  saveReport();
}

await main();
