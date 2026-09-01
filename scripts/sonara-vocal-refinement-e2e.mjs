import fs from 'node:fs';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const POLL_MS = Math.max(1500, Number(process.env.POLL_MS || 5000));
const MAX_POLLS = Math.max(30, Number(process.env.MAX_POLLS || 160));
const REPORT_PATH = process.env.SONARA_VOCAL_REPORT || 'sonara-vocal-refinement-e2e-report.json';
const PROJECT_ID = `vocal-refine-canary-${Date.now()}`;
const MAX_ACCEPTABLE_TECHNICAL_REGRESSION = 1.0;
const QUALITY_RETRY_ATTEMPTS = 4;
const CONSERVATIVE_ISSUES = [
  'harsh sibilance and brittle consonants',
  'unstable formants or synthetic vowel tone'
];

const report = {
  startedAt: new Date().toISOString(),
  apiOrigin: API,
  projectId: PROJECT_ID,
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

async function requestJson(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 300_000)) });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${init.label || url}: non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`); }
  if (!allowed.includes(response.status)) throw new Error(`${init.label || url}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 900)}`);
  return { response, data };
}

function jobOf(data) { return data?.job || data?.data || data || {}; }
function statusOf(data) { return String(jobOf(data)?.status || '').toUpperCase(); }
function audioUrlsFrom(data) {
  const job = jobOf(data);
  const urls = [];
  const add = value => {
    const text = String(value || '').trim();
    if (/^https:\/\//i.test(text) && !urls.includes(text)) urls.push(text);
  };
  add(job.audioUrl);
  for (const value of Array.isArray(job.audioUrls) ? job.audioUrls : []) add(value);
  for (const item of Array.isArray(job.candidates) ? job.candidates : []) add(item?.audioUrl || item?.url);
  for (const item of Array.isArray(job.outputs) ? job.outputs : []) add(item?.audioUrl || item?.url);
  return urls;
}

function isWav(value) {
  try {
    const url = new URL(String(value || ''));
    const path = String(url.searchParams.get('path') || url.pathname).toLowerCase();
    return path.endsWith('.wav') || path.endsWith('.wav32');
  } catch { return false; }
}

async function waitForRoute() {
  stage('00 vocal-refine route');
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const { response, data } = await requestJson(`${API}/api/studio/vocal-refine?canary=${Date.now()}-${attempt}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: '{}',
        label: 'vocal-refine route probe',
        timeoutMs: 15_000
      }, [400]);
      if (response.status === 400 && String(data?.error || '').includes('sourceAudioUrl')) {
        console.log('Vocal Refinement route READY.');
        return;
      }
    } catch (error) {
      console.log(`route wait ${attempt}/40: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(3000);
  }
  throw new Error('Vocal Refinement route non disponibile dopo il deploy.');
}

async function poll(jobId, label, music = false) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const url = music
      ? `${WEB}/api/music/job/${encodeURIComponent(jobId)}?vocalCanary=${attempt}-${Date.now()}`
      : `${API}/api/studio/job/${encodeURIComponent(jobId)}?vocalCanary=${attempt}-${Date.now()}`;
    try {
      const { data } = await requestJson(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' }, label: `${label} poll` });
      const status = statusOf(data);
      const job = jobOf(data);
      console.log(`${label} ${attempt}/${MAX_POLLS}: ${status || 'UNKNOWN'} ${Number(job.progress || 0)}%`);
      if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(status)) return job;
      if (['FAILED', 'ERROR', 'CANCELLED'].includes(status)) throw new Error(`${label}: ${status}: ${JSON.stringify(job.error || job).slice(0, 900)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b(FAILED|ERROR|CANCELLED)\b/.test(message)) throw error;
      console.log(`${label} retry: ${message}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: timeout.`);
}

function transientQualityFailure(message) {
  return /(?:non-JSON HTTP|HTTP)\s+(502|503|504)\b/i.test(String(message || '')) || /timeout|fetch failed/i.test(String(message || ''));
}

async function quality(audioUrl, label) {
  let data = null;
  let lastError = null;
  for (let attempt = 1; attempt <= QUALITY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await requestJson(`${API}/api/studio/quality-v2?attempt=${attempt}-${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ audioUrls: [audioUrl], bpm: 118, key: 'A Minor', durationSec: 30 }),
        label: `${label} quality`,
        timeoutMs: 45_000
      });
      data = result.data;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error;
      if (!transientQualityFailure(message) || attempt === QUALITY_RETRY_ATTEMPTS) throw error;
      console.log(`${label} quality transient retry ${attempt}/${QUALITY_RETRY_ATTEMPTS}: ${message.slice(0, 180)}`);
      await sleep(2500 * attempt);
    }
  }
  if (!data) throw lastError || new Error(`${label}: Quality 2.0 non disponibile.`);

  const reports = Array.isArray(data?.reports) ? data.reports : [];
  const first = reports[0] || {};
  const score = Number(first.professionalScore ?? data?.summary?.bestProfessionalScore ?? 0);
  const measured = reports.some(item => item?.measuredFromRealWav === true);
  const hard = reports.flatMap(item => item?.hardFailureReasons || []).filter(Boolean);
  report.quality[label] = { score, measuredFromRealWav: measured, hardFailureReasons: hard, reports };
  console.log(`${label}: ${score}/100 measured=${measured}`);
  if (!measured) throw new Error(`${label}: Quality 2.0 non ha misurato un WAV reale.`);
  if (hard.some(reason => ['analysis-error', 'real-wav-analysis-missing', 'clipping', 'excessive-silence', 'dc-offset'].includes(String(reason)))) {
    throw new Error(`${label}: hard quality failure: ${hard.join(', ')}`);
  }
  if (score < 88) throw new Error(`${label}: release gate 88 non superato (${score}).`);
  return score;
}

async function generateVocal() {
  stage('01 ULTRA vocal generation');
  const lyrics = '[Verse]\nNeon on the window, midnight in my eyes\nI can hear the city breathing through the lights\n\n[Chorus]\nStay with me inside this purple night\nHold the rhythm till the morning light';
  const prompt = 'Professional deep melodic house with a natural intimate female lead vocal, 118 BPM, A minor. Warm controlled sub bass, rounded kick, elegant analog chords, restrained percussion, nocturnal synth atmosphere, emotional memorable chorus. Vocal must be human, intelligible, stable in identity, free of metallic phase artifacts and harsh sibilance. Preserve the supplied English lyrics exactly.';
  const { data } = await requestJson(`${API}/api/engine/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      title: 'SONARA Vocal Refinement Canary',
      genreFamily: 'Electronic / Dance', genre: 'House', subgenre: 'Melodic House', mood: 'Emotional, nocturnal, intimate',
      rawPrompt: prompt, prompt, lyrics, vocalMode: 'female', vocalLanguage: 'en',
      bpm: 118, key: 'A Minor', durationSec: 30, weirdness: 35, styleInfluence: 94,
      generationProfileV3: 'ultra', renderProfile: 'ultra',
      projectId: PROJECT_ID, sonaraVocalRefinementCanary: true
    }),
    label: 'vocal generation submit'
  });
  const jobId = String(data?.jobId || data?.result?.jobId || '');
  if (!jobId) throw new Error(`Vocal generation senza jobId: ${JSON.stringify(data).slice(0, 900)}`);
  const done = await poll(jobId, 'vocal-generation', true);
  const urls = audioUrlsFrom(done).slice(0, 2);
  if (!urls.length) throw new Error('Vocal generation completata senza audio.');
  if (urls.some(url => !isWav(url))) throw new Error('Vocal generation non ha restituito WAV reali.');
  const metadata = done.metadata || {};
  if (String(metadata.profile || '').toLowerCase() !== 'ultra') throw new Error(`Profilo ULTRA non confermato: ${JSON.stringify(metadata).slice(0, 500)}`);
  if (metadata.topLevelAudioAlignedWithDirectorRank !== true) throw new Error('Director rank-one alignment non confermato nel job completato.');
  report.outputs.generation = { jobId, audioUrls: urls, metadata };
  return urls[0];
}

async function refineVocal(sourceAudioUrl) {
  stage('02 conservative vocal refinement');
  const { data } = await requestJson(`${API}/api/studio/vocal-refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceAudioUrl,
      bpm: 118,
      key: 'A Minor',
      durationSec: 30,
      preserveStrength: 0.95,
      issues: CONSERVATIVE_ISSUES,
      prompt: 'Conservative vocal-only polish. Preserve the song, instrumental, dynamics, lyrics word-for-word, singer identity, melody, timing, BPM and key. Make only minimal corrections to harsh sibilance and unstable synthetic vocal formants. Do not recompose, rebalance or remaster the instrumental.',
      sonaraVocalRefinementCanary: true,
      sonaraConservativeVocalRefinement: true
    }),
    label: 'vocal refinement submit'
  });
  const jobId = String(data?.jobId || '');
  if (!jobId) throw new Error(`Vocal Refinement senza jobId: ${JSON.stringify(data).slice(0, 900)}`);
  if (data?.requestedOperation !== 'vocal-refine') throw new Error('Vocal Refinement contract: requestedOperation mancante.');
  const lock = data?.vocalRefinement || {};
  if (lock.lyricsLocked !== true || lock.singerIdentityLocked !== true || lock.arrangementLocked !== true) {
    throw new Error(`Vocal Refinement lock contract non valido: ${JSON.stringify(lock).slice(0, 700)}`);
  }
  if (lock.customIssuesAuthoritative !== true || JSON.stringify(lock.issues) !== JSON.stringify(CONSERVATIVE_ISSUES)) {
    throw new Error(`Vocal Refinement issue scope non conservativo: ${JSON.stringify(lock).slice(0, 900)}`);
  }
  if (Math.abs(Number(lock.preserveStrength) - 0.95) > 0.001) throw new Error(`Vocal Refinement preserveStrength inatteso: ${lock.preserveStrength}`);

  const done = await poll(jobId, 'vocal-refinement', false);
  const urls = audioUrlsFrom(done);
  if (!urls.length) throw new Error('Vocal Refinement completato senza audio.');
  if (!isWav(urls[0])) throw new Error('Vocal Refinement non ha restituito un WAV reale.');
  report.outputs.refinement = { submit: data, completedJob: done, audioUrls: urls };
  return urls[0];
}

async function main() {
  try {
    await waitForRoute();
    const source = await generateVocal();
    const before = await quality(source, 'before-refinement');
    const refined = await refineVocal(source);
    const after = await quality(refined, 'after-refinement');
    const delta = Number((after - before).toFixed(1));
    report.outputs.sourceAudioUrl = source;
    report.outputs.refinedAudioUrl = refined;
    report.outputs.technicalScoreDelta = delta;
    if (delta < -MAX_ACCEPTABLE_TECHNICAL_REGRESSION) {
      throw new Error(`Vocal Refinement technical regression troppo alta: ${before} -> ${after} (${delta}). Limite: -${MAX_ACCEPTABLE_TECHNICAL_REGRESSION}.`);
    }
    report.ok = true;
    stage('FINAL PASS', { beforeScore: before, afterScore: after, technicalScoreDelta: delta, maxAcceptableRegression: MAX_ACCEPTABLE_TECHNICAL_REGRESSION, note: 'Technical Quality 2.0 does not by itself measure subjective vocal naturalness.' });
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.message : String(error);
    console.error(report.error);
    save();
    process.exitCode = 1;
    return;
  }
  save();
}

await main();
