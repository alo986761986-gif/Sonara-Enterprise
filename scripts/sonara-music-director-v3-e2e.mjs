import fs from 'node:fs';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const SECRET = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
const REPORT_PATH = process.env.SONARA_DIRECTOR_V3_REPORT || 'sonara-music-director-v3-e2e-report.json';
const POLL_MS = Math.max(2500, Number(process.env.POLL_MS || 5000));
const MAX_POLLS = Math.max(40, Number(process.env.MAX_POLLS || 180));
const PROJECT = `director-v3-canary-${Date.now()}`;
const PROFILE = 'sonara-director-v3-canary';

const report = {
  startedAt: new Date().toISOString(),
  apiOrigin: API,
  webOrigin: WEB,
  projectId: PROJECT,
  capabilities: null,
  profiles: {},
  ok: false,
  diagnostics: []
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
};
const h = extra => ({
  ...(SECRET ? { 'X-Sonara-Internal-Secret': SECRET } : {}),
  'X-Sonara-Profile-Id': PROFILE,
  'X-Sonara-Project-Id': PROJECT,
  ...(extra || {})
});

async function json(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(Number(init.timeoutMs || 300_000))
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${init.label || url}: non-JSON HTTP ${response.status}: ${text.slice(0, 400)}`); }
  if (!allowed.includes(response.status)) throw new Error(`${init.label || url}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  return data;
}

function statusOf(data) {
  const raw = String(data?.status || data?.state || data?.data?.status || data?.data?.state || '').toUpperCase();
  if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE', 'FINISHED', 'READY'].includes(raw)) return 'COMPLETED';
  if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(raw)) return 'FAILED';
  return 'PROCESSING';
}

function jobOf(data) {
  return data?.job || data?.data || data || {};
}

function audioUrls(data) {
  const job = jobOf(data);
  const out = [];
  const add = value => {
    const v = String(value || '').trim();
    if (/^https:\/\//i.test(v) && !out.includes(v)) out.push(v);
  };
  add(job.audioUrl);
  for (const item of Array.isArray(job.candidates) ? job.candidates : []) add(item?.audioUrl || item?.url);
  for (const item of Array.isArray(job.outputs) ? job.outputs : []) add(item?.audioUrl || item?.url);
  for (const value of Array.isArray(job.audioUrls) ? job.audioUrls : []) add(value);
  return out;
}

function isWavUrl(value) {
  try {
    const u = new URL(String(value));
    const path = String(u.searchParams.get('path') || u.pathname).toLowerCase();
    return path.endsWith('.wav') || path.endsWith('.wav32');
  } catch { return false; }
}

async function waitForCapabilities() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const data = await json(`${API}/api/music/director/capabilities?canary=${Date.now()}-${attempt}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        label: 'capabilities'
      }, [200]);
      if (String(data?.version || '') === 'sonara-music-director-v3') {
        if (Number(data?.profiles?.quality?.internalCandidates) !== 4) throw new Error('QUALITY internalCandidates non è 4.');
        if (Number(data?.profiles?.ultra?.internalCandidates) !== 4) throw new Error('ULTRA internalCandidates non è 4.');
        if (Number(data?.profiles?.ultra?.targetProfessionalScore) !== 92) throw new Error('ULTRA targetProfessionalScore non è 92.');
        if (data?.automaticQualityRepair !== true) throw new Error('automaticQualityRepair non è attivo.');
        report.capabilities = data;
        console.log(`Music Director V3 pubblico dopo ${attempt} tentativi.`);
        return data;
      }
    } catch (error) {
      report.diagnostics.push(`capabilities ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(4000);
  }
  throw new Error('Music Director V3 non è diventato pubblico entro la finestra di verifica.');
}

async function pollJob(jobId, profile) {
  for (let i = 1; i <= MAX_POLLS; i += 1) {
    const data = await json(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?directorV3Canary=${Date.now()}-${i}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      label: `${profile} poll`
    }, [200, 202]);
    const job = jobOf(data);
    const status = statusOf(data);
    console.log(`${profile.toUpperCase()} ${i}/${MAX_POLLS}: ${status} ${Number(job.progress || data?.progress || 0)}%`);
    if (status === 'FAILED') throw new Error(`${profile}: job fallito: ${JSON.stringify(job.error || job.message || job).slice(0, 1200)}`);
    if (status === 'COMPLETED') return job;
    await sleep(POLL_MS);
  }
  throw new Error(`${profile}: timeout dopo ${MAX_POLLS} poll.`);
}

function assertDirectorResult(profile, done, threshold) {
  const urls = audioUrls(done).slice(0, 2);
  const meta = done?.metadata || {};
  const summary = done?.sonaraQualityDirector || done?.data?.sonaraQualityDirector || {};
  const reports = Array.isArray(summary?.reports) ? summary.reports : [];
  const bestScore = Number(meta.bestProfessionalScore ?? summary.bestProfessionalScore ?? 0);
  const generatedCount = Number(meta.generatedCandidateCount || 0);
  const visibleCount = Number(meta.visibleCandidateCount || urls.length);

  if (urls.length !== 2) throw new Error(`${profile}: attesi 2 risultati visibili, ricevuti ${urls.length}.`);
  if (!urls.every(isWavUrl)) throw new Error(`${profile}: i due master finali non sono WAV reali: ${urls.join(' | ')}`);
  if (String(meta.profile || '').toLowerCase() !== profile) throw new Error(`${profile}: metadata.profile errato (${meta.profile || 'missing'}).`);
  if (generatedCount < 4) throw new Error(`${profile}: attesi almeno 4 candidati interni reali, ricevuti ${generatedCount}.`);
  if (visibleCount !== 2) throw new Error(`${profile}: visibleCandidateCount=${visibleCount}, atteso 2.`);
  if (meta.automaticCandidateRanking !== true) throw new Error(`${profile}: automaticCandidateRanking non attivo.`);
  if (Number(meta.professionalTargetScore || 0) !== threshold) throw new Error(`${profile}: target score ${meta.professionalTargetScore}, atteso ${threshold}.`);
  if (bestScore < threshold) throw new Error(`${profile}: bestProfessionalScore ${bestScore}/100 sotto soglia ${threshold}.`);
  if (meta.releaseReady !== true) throw new Error(`${profile}: releaseReady non true nonostante il canary richieda la soglia.`);
  if (!reports.length || !reports.some(item => item?.measuredFromRealWav === true)) throw new Error(`${profile}: nessun report misurato dal WAV reale.`);
  if (!reports[0]?.professionalReleasePassed) throw new Error(`${profile}: il candidato #1 non supera il professional release gate.`);
  if (done?.candidates?.[0]?.sonaraRecommended !== true && done?.outputs?.[0]?.sonaraRecommended !== true) throw new Error(`${profile}: il vincitore non è marcato sonaraRecommended.`);

  return {
    jobId: String(done?.jobId || done?.job_id || ''),
    audioUrls: urls,
    bestProfessionalScore: bestScore,
    targetProfessionalScore: threshold,
    generatedCandidateCount: generatedCount,
    visibleCandidateCount: visibleCount,
    automaticQualityRepair: Boolean(meta.automaticQualityRepair),
    reports: reports.map(item => ({
      candidateIndex: item?.candidateIndex,
      professionalScore: item?.professionalScore,
      professionalReleasePassed: item?.professionalReleasePassed,
      measuredFromRealWav: item?.measuredFromRealWav,
      hardFailureReasons: item?.hardFailureReasons || []
    }))
  };
}

async function runProfile(profile, threshold) {
  console.log(`\n=== REAL ${profile.toUpperCase()} GENERATION ===`);
  const prompt = profile === 'ultra'
    ? 'Release-ready deep house instrumental, exact 122 BPM in A minor. Expensive analog character, deep controlled sub, rounded club kick, detailed restrained percussion, warm extended minor chords, dub space, evolving nocturnal pads, memorable two-bar hook, organic micro-variation, strong tension and release, deliberate DJ-friendly ending, natural dynamics, pristine transients, coherent stereo depth. No vocals. No generic EDM. No copy-paste looping.'
    : 'Professional deep house instrumental, exact 122 BPM in A minor. Deep controlled sub bass, rounded club kick, crisp restrained percussion, warm analog minor chords, subtle dub echoes, evolving nocturnal pads, memorable understated motif, tension and release, polished stereo depth, clean transients, deliberate ending. No vocals. Avoid generic EDM and pop structure.';

  const submitted = await json(`${API}/api/engine/generate`, {
    method: 'POST',
    headers: h({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({
      title: `SONARA Director V3 ${profile.toUpperCase()} Canary`,
      genreFamily: 'Electronic / Dance',
      genre: 'House',
      subgenre: 'Deep House',
      mood: 'Deep, dark, emotional, hypnotic, elegant, late-night',
      rawPrompt: prompt,
      prompt,
      lyrics: '',
      vocalMode: 'instrumental',
      bpm: 122,
      key: 'A Minor',
      durationSec: 30,
      weirdness: profile === 'ultra' ? 42 : 48,
      styleInfluence: profile === 'ultra' ? 96 : 92,
      candidateCount: 2,
      dualFast: true,
      generationProfileV3: profile,
      sonaraMusicDirectorV3: 'sonara-music-director-v3',
      projectId: PROJECT,
      profileId: PROFILE,
      sonaraDirectorV3E2E: true
    }),
    label: `${profile} submit`
  });

  const jobId = String(submitted?.jobId || submitted?.job_id || submitted?.id || '');
  if (!jobId.startsWith('director-v3-')) throw new Error(`${profile}: jobId non orchestrato dal Director V3 (${jobId || 'missing'}).`);
  const done = await pollJob(jobId, profile);
  const snapshot = assertDirectorResult(profile, done, threshold);
  snapshot.jobId = jobId;
  report.profiles[profile] = snapshot;
  save();
  return snapshot;
}

async function main() {
  try {
    await waitForCapabilities();
    await runProfile('quality', 88);
    await runProfile('ultra', 92);
    report.ok = true;
    save();
    console.log('\nSONARA MUSIC DIRECTOR V3 REAL QUALITY/ULTRA CANARY: PASS');
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.message : String(error);
    save();
    console.error(`\nSONARA MUSIC DIRECTOR V3 CANARY: FAIL\n${report.error}`);
    process.exitCode = 1;
  }
}

await main();
