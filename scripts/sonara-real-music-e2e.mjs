import fs from 'node:fs';
import {
  analyzeProfessionalCandidate,
  summarizeProfessionalReports
} from '../cloudflare/sonara-quality-director-v2.mjs';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const SECRET = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
const STRICT = /^(1|true|yes)$/i.test(String(process.env.STRICT_RELEASE_GATE || ''));
const POLL_MS = Math.max(1500, Number(process.env.POLL_MS || 5000));
const MAX_POLLS = Math.max(20, Number(process.env.MAX_POLLS || 160));
const PROJECT_ID = `production-canary-${Date.now()}`;
const PROFILE_ID = 'sonara-production-canary';
const REPORT_PATH = process.env.SONARA_E2E_REPORT || 'sonara-real-music-e2e-report.json';

const report = {
  startedAt: new Date().toISOString(),
  apiOrigin: API,
  webOrigin: WEB,
  projectId: PROJECT_ID,
  strictReleaseGate: STRICT,
  stages: [],
  outputs: {},
  quality: {},
  diagnostics: []
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
};
const stage = (name, data = {}) => {
  report.stages.push({ name, at: new Date().toISOString(), ...data });
  console.log(`\n=== ${name} ===`);
  if (Object.keys(data).length) console.log(JSON.stringify(data, null, 2));
};
const headers = extra => ({
  ...(SECRET ? { 'X-Sonara-Internal-Secret': SECRET } : {}),
  'X-Sonara-Profile-Id': PROFILE_ID,
  'X-Sonara-Project-Id': PROJECT_ID,
  ...(extra || {})
});

async function jsonRequest(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 300_000)) });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${init.label || url}: non-JSON HTTP ${response.status}: ${text.slice(0, 350)}`); }
  if (!allowed.includes(response.status)) throw new Error(`${init.label || url}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 900)}`);
  return data;
}

function jobOf(data) { return data?.job || data?.data || data || {}; }
function statusOf(data) { return String(data?.status || data?.job?.status || data?.data?.status || '').toUpperCase(); }
function audioUrlsFrom(data) {
  const job = jobOf(data);
  const out = [];
  const add = value => {
    const text = String(value || '').trim();
    if (/^https:\/\//i.test(text) && !out.includes(text)) out.push(text);
  };
  add(job.audioUrl);
  for (const value of Array.isArray(job.audioUrls) ? job.audioUrls : []) add(value);
  for (const item of Array.isArray(job.candidates) ? job.candidates : []) add(item?.audioUrl || item?.url);
  for (const item of Array.isArray(job.outputs) ? job.outputs : []) add(item?.audioUrl || item?.url);
  for (const item of Array.isArray(job.stems) ? job.stems : []) add(item?.audioUrl || item?.url);
  return out;
}

function audioFormatFromUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const path = String(url.searchParams.get('path') || url.pathname).toLowerCase();
    if (path.endsWith('.wav') || path.endsWith('.wav32')) return 'wav';
    if (path.endsWith('.flac')) return 'flac';
    if (path.endsWith('.mp3')) return 'mp3';
    if (path.endsWith('.aac') || path.endsWith('.m4a')) return 'aac';
    if (path.endsWith('.opus') || path.endsWith('.ogg')) return 'opus';
  } catch {}
  return 'unknown';
}

function requireWavOutputs(urls, label, exactCount = null) {
  const formats = urls.map(audioFormatFromUrl);
  if (exactCount !== null && urls.length !== exactCount) throw new Error(`${label}: attesi ${exactCount} WAV, ricevuti ${urls.length}.`);
  if (!formats.length || formats.some(format => format !== 'wav')) throw new Error(`${label}: output non interamente WAV (${formats.join(', ')}).`);
}

function requireReleasePass(label, summary) {
  const snapshot = report.quality[label] || {};
  if (snapshot.endpointMeasured !== true) throw new Error(`${label}: Quality 2.0 non ha misurato il WAV reale in produzione.`);
  if (Number(summary?.passed || 0) < 1) throw new Error(`${label}: release gate 88 non superato (${snapshot.bestScore ?? 'n/a'}/100).`);
}

async function poll({ jobId, pollUrl, label, publicMusicJob = false }) {
  for (let i = 1; i <= MAX_POLLS; i += 1) {
    const url = pollUrl
      ? new URL(pollUrl, API).toString()
      : publicMusicJob
        ? `${WEB}/api/music/job/${encodeURIComponent(jobId)}?canary=${i}-${Date.now()}`
        : `${API}/api/studio/job/${encodeURIComponent(jobId)}?canary=${i}-${Date.now()}`;
    try {
      const data = await jsonRequest(url, {
        method: 'GET',
        headers: publicMusicJob ? { 'Cache-Control': 'no-cache' } : headers({ 'Cache-Control': 'no-cache' }),
        label: `${label} poll`
      });
      const job = jobOf(data);
      const status = statusOf(data);
      console.log(`${label} ${i}/${MAX_POLLS}: ${status || 'UNKNOWN'} ${Number(job.progress || 0)}%`);
      if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(status)) return job;
      if (['FAILED','ERROR','CANCELLED'].includes(status)) throw new Error(`${label}: ${status}: ${JSON.stringify(job.error || job.message || job).slice(0, 900)}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/\b(FAILED|ERROR|CANCELLED)\b/.test(text)) throw error;
      if (/Worker exceeded resources/i.test(text)) throw new Error(`${label}: Cloudflare Worker exceeded resources during polling.`);
      console.log(`${label} poll retry: ${text}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: timeout dopo ${MAX_POLLS} poll.`);
}

async function projectMemory() {
  stage('01 project memory');
  const body = {
    projectId: PROJECT_ID,
    profileId: PROFILE_ID,
    title: 'SONARA Studio 2.0 Real E2E Canary',
    family: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House',
    atmosphere: 'Deep, dark, emotional, hypnotic, elegant, late-night',
    bpm: 122, key: 'A Minor',
    motif: 'Understated two-bar nocturnal analog motif with restrained syncopation',
    chorusIdentity: 'Instrumental main hook remains recognizable without pop chorus behavior',
    harmony: 'A-minor deep-house harmonic language with warm extended minor voicings',
    instrumentation: 'Club kick, controlled sub bass, restrained percussion, analog chords, dub echoes, nocturnal pads',
    arrangement: 'Intro -> groove development -> motif reveal -> tension -> main payoff -> deliberate ending',
    ending: 'Composed DJ-friendly resolution, no abrupt cut'
  };
  await jsonRequest(`${API}/api/studio/project-memory`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), label: 'memory write'
  });
  const data = await jsonRequest(`${API}/api/studio/project-memory?projectId=${encodeURIComponent(PROJECT_ID)}`, {
    method: 'GET', headers: headers(), label: 'memory read'
  });
  const memory = data?.memory || {};
  if (Number(memory.bpm) !== 122 || String(memory.key) !== 'A Minor' || !String(memory.motif || '').includes('nocturnal')) {
    throw new Error(`Long Memory non coerente: ${JSON.stringify(memory).slice(0, 1000)}`);
  }
  report.outputs.projectMemory = memory;
}

async function generateAB() {
  stage('02 real A/B generation');
  const prompt = 'Professional deep house instrumental. Exact 122 BPM in A minor. Deep controlled sub bass, rounded club kick, crisp restrained percussion, warm analog minor chords, subtle dub echoes, evolving nocturnal pads, memorable understated motif, tension and release, polished stereo depth, clean transients, deliberate ending. No vocals. Avoid generic EDM and pop structure.';
  const data = await jsonRequest(`${API}/api/engine/generate`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({
      title: 'SONARA Studio 2.0 Real E2E Canary', genreFamily: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House',
      mood: 'Deep, dark, emotional, hypnotic, elegant, late-night', rawPrompt: prompt, prompt, lyrics: '', vocalMode: 'instrumental',
      bpm: 122, key: 'A Minor', durationSec: 30, weirdness: 48, styleInfluence: 92, candidateCount: 2, dualFast: true,
      projectId: PROJECT_ID, profileId: PROFILE_ID, sonaraRealE2E: true
    }),
    label: 'generation submit'
  });
  const jobId = String(data?.jobId || '');
  if (!jobId) throw new Error(`Generazione senza jobId: ${JSON.stringify(data).slice(0, 900)}`);
  report.outputs.generationJobId = jobId;
  const done = await poll({ jobId, label: 'generation', publicMusicJob: true });
  const urls = audioUrlsFrom(done).slice(0, 2);
  if (urls.length !== 2) throw new Error(`Attesi 2 master A/B, ricevuti ${urls.length}.`);
  report.outputs.generation = { jobId, audioUrls: urls, metadata: done.metadata || null };
  return urls;
}

async function quality2(audioUrls, label, requested) {
  stage(`${label} Quality 2.0`);
  let endpointData = null;
  try {
    endpointData = await jsonRequest(`${API}/api/studio/quality-v2`, {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ audioUrls, ...requested }), label: `${label} quality endpoint`
    });
  } catch (error) {
    report.diagnostics.push(`${label}: endpoint Quality 2.0 error: ${error instanceof Error ? error.message : String(error)}`);
  }

  let reports = Array.isArray(endpointData?.reports) ? endpointData.reports : [];
  const endpointMeasured = reports.some(item => item?.measuredFromRealWav === true);
  if (!endpointMeasured) {
    const endpointErrors = reports.map(item => item?.error).filter(Boolean);
    report.diagnostics.push(`${label}: Quality endpoint non ha misurato WAV reali${endpointErrors.length ? ` (${endpointErrors.join(' | ')})` : ''}.`);

    const formats = [...new Set(audioUrls.map(audioFormatFromUrl))];
    const allWav = formats.every(format => format === 'wav');
    if (!allWav) {
      const message = `${label}: output Studio in formato ${formats.join(', ')}; il Quality Engine corrente misura PCM WAV. Continuo il canary funzionale e segnalo la conversione/forcing WAV come hardening richiesto.`;
      report.diagnostics.push(message);
      report.quality[label] = { endpointMeasured: false, skippedNonWav: true, formats, bestScore: null, passed: false, reports };
      console.log(message);
      return { bestCandidateIndex: 0, bestProfessionalScore: null, passed: 0, reports };
    }

    try {
      reports = await Promise.all(audioUrls.map(async (audioUrl, index) => ({
        ...(await analyzeProfessionalCandidate(audioUrl, requested)), index, audioUrl
      })));
    } catch (error) {
      const message = `${label}: analisi diretta runner fallita: ${error instanceof Error ? error.message : String(error)}`;
      report.diagnostics.push(message);
      if (label !== 'base-generation') {
        report.quality[label] = { endpointMeasured: false, skippedAnalysisError: true, bestScore: null, passed: false, reports };
        console.log(message);
        return { bestCandidateIndex: 0, bestProfessionalScore: null, passed: 0, reports };
      }
      throw error;
    }
  }

  const summary = summarizeProfessionalReports(reports, requested);
  if (!summary.reports.some(item => item.measuredFromRealWav === true)) {
    if (label !== 'base-generation') {
      report.quality[label] = { endpointMeasured, skippedNoRealWav: true, bestScore: summary.bestProfessionalScore, passed: false, summary, reports: summary.reports };
      return summary;
    }
    throw new Error(`${label}: nessun WAV reale analizzato.`);
  }
  const fatal = summary.reports.flatMap(item => item.hardFailureReasons || []).filter(reason => ['analysis-error','real-wav-analysis-missing','clipping','excessive-silence','dc-offset'].includes(String(reason)));
  if (fatal.length) throw new Error(`${label}: hard quality failure: ${[...new Set(fatal)].join(', ')}`);
  report.quality[label] = { endpointMeasured, bestScore: summary.bestProfessionalScore, passed: summary.passed > 0, summary, reports: summary.reports };
  console.log(`${label}: ${summary.bestProfessionalScore}/100 - ${summary.passed > 0 ? 'RELEASE PASS' : 'REVIEW'}`);
  if (STRICT && summary.passed < 1) throw new Error(`${label}: release gate 88 non superato.`);
  return summary;
}

async function studioOperation(operation, sourceAudioUrl, extra = {}) {
  stage(`${operation} real operation`);
  const body = {
    sourceAudioUrl,
    prompt: extra.prompt || '', bpm: 122, key: 'A Minor', durationSec: extra.durationSec ?? 30,
    audio_format: 'wav',
    projectId: PROJECT_ID, profileId: PROFILE_ID, sonaraRealE2E: true,
    ...(extra.start == null ? {} : { start: extra.start }),
    ...(extra.end == null ? {} : { end: extra.end }),
    ...(extra.body || {})
  };
  const data = await jsonRequest(`${API}/api/studio/${operation}`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body), label: `${operation} submit`
  });
  const jobId = String(data?.jobId || '');
  if (!jobId) throw new Error(`${operation}: jobId mancante: ${JSON.stringify(data).slice(0, 900)}`);
  report.outputs[`${operation}JobId`] = jobId;
  const done = await poll({ jobId, pollUrl: data?.pollUrl, label: operation });
  const urls = audioUrlsFrom(done);
  report.outputs[operation] = {
    jobId,
    audioUrls: urls,
    formats: urls.map(audioFormatFromUrl),
    outputs: Array.isArray(done.outputs) ? done.outputs.map(item => ({ id: item?.id || null, label: item?.label || null, kind: item?.kind || null, stem: item?.stem || null, audioUrl: item?.audioUrl || item?.url || null, model: item?.model || null })) : [],
    metadata: done.metadata || null,
    qualityJudge: done.qualityJudge || null,
    raw: urls.length ? undefined : done
  };
  if (!urls.length) throw new Error(`${operation}: completato senza URL audio.`);
  return urls;
}

async function main() {
  try {
    stage('00 release status');
    const release = await jsonRequest(`${API}/api/studio/release-status?canary=${Date.now()}`, { method: 'GET', headers: headers(), label: 'release status' });
    if (release?.studio?.sessions !== '2.0' || release?.studio?.maxStems !== 12) throw new Error('Studio 2.0 release contract non valido.');
    report.outputs.releaseStatus = release;

    await projectMemory();
    const base = await generateAB();
    requireWavOutputs(base, 'base-generation', 2);
      const baseSummary = await quality2(base, 'base-generation', { bpm: 122, key: 'A Minor', durationSec: 30 });
      requireReleasePass('base-generation', baseSummary);
    const bestIndex = Number.isInteger(Number(baseSummary.bestCandidateIndex)) ? Number(baseSummary.bestCandidateIndex) : 0;
    const bestSource = base[Math.max(0, Math.min(base.length - 1, bestIndex))];
    report.outputs.bestBaseCandidate = bestSource;

    const replaced = await studioOperation('replace', bestSource, {
      start: 8, end: 16, durationSec: 30,
      prompt: 'Keep the same Deep House song and all surrounding material. Inside 8-16 seconds only, make percussion slightly more organic and detailed while preserving kick, bass, chords, motif, BPM, key, ambience and loudness. Boundaries must be inaudible.'
    });
    requireWavOutputs(replaced, 'replace');
      const replaceSummary = await quality2([replaced[0]], 'replace', { bpm: 122, key: 'A Minor', durationSec: 30 });
      requireReleasePass('replace', replaceSummary);

    const extended = await studioOperation('extend', replaced[0], {
      durationSec: 45,
      prompt: 'Extend naturally by about 15 seconds. Preserve Deep House identity, exact 122 BPM, A minor, motif memory, groove, instrumentation, sound palette and mastering character. Develop the motif once, then create a deliberate musical ending.'
    });
    requireWavOutputs(extended, 'extend');
      const extendSummary = await quality2([extended[0]], 'extend', { bpm: 122, key: 'A Minor', durationSec: 45 });
      requireReleasePass('extend', extendSummary);

    const stems = await studioOperation('stems-pro', bestSource, {
      durationSec: 30,
      prompt: 'Create professional time-aligned stems with minimum bleed and artifacts.',
      body: { stems: ['vocals','drums','bass','guitar','keys','synth','strings','brass','woodwinds','percussion','pads','fx'] }
    });
    requireWavOutputs(stems, 'Stems Pro', 12);
      const expectedStemLabels = ['Vocals','Drums','Bass','Guitar','Keys','Synth','Strings','Brass','Woodwinds','Percussion','Pads','FX'];
      const stemLabels = (report.outputs['stems-pro']?.outputs || []).map(item => String(item?.label || '')).filter(Boolean);
      const missingLabels = expectedStemLabels.filter(label => !stemLabels.includes(label));
      if (missingLabels.length) throw new Error(`Stems Pro: stem distinti mancanti: ${missingLabels.join(', ')}.`);

    report.ok = true;
    stage('FINAL PASS', { baseCandidates: 2, replace: true, extend: true, stemsUrls: stems.length });
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.stack || error.message : String(error);
    console.error(report.error);
    save();
    process.exitCode = 1;
    return;
  }
  save();
}

await main();
