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
  genres: {},
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
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 300_000)) });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${init.label || url}: non-JSON HTTP ${response.status}: ${text.slice(0, 400)}`); }
  if (!allowed.includes(response.status)) throw new Error(`${init.label || url}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  return data;
}

function statusOf(data) {
  const raw = String(data?.status || data?.state || data?.data?.status || data?.data?.state || '').toUpperCase();
  if (['COMPLETED','SUCCESS','SUCCEEDED','DONE','FINISHED','READY'].includes(raw)) return 'COMPLETED';
  if (['FAILED','ERROR','CANCELLED','CANCELED'].includes(raw)) return 'FAILED';
  return 'PROCESSING';
}
function jobOf(data) { return data?.job || data?.data || data || {}; }
function audioUrls(data) {
  const job = jobOf(data); const out = [];
  const add = value => { const v = String(value || '').trim(); if (/^https:\/\//i.test(v) && !out.includes(v)) out.push(v); };
  add(job.audioUrl);
  for (const item of Array.isArray(job.candidates) ? job.candidates : []) add(item?.audioUrl || item?.url);
  for (const item of Array.isArray(job.outputs) ? job.outputs : []) add(item?.audioUrl || item?.url);
  for (const value of Array.isArray(job.audioUrls) ? job.audioUrls : []) add(value);
  return out;
}
function isWavUrl(value) {
  try { const u = new URL(String(value)); const path = String(u.searchParams.get('path') || u.pathname).toLowerCase(); return path.endsWith('.wav') || path.endsWith('.wav32'); }
  catch { return false; }
}

async function waitForCapabilities() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const data = await json(`${API}/api/music/director/capabilities?canary=${Date.now()}-${attempt}`, { method: 'GET', headers: { 'Cache-Control': 'no-cache' }, label: 'capabilities' }, [200]);
      if (String(data?.version || '') === 'sonara-music-director-v3') {
        if (Number(data?.profiles?.quality?.internalCandidates) !== 4) throw new Error('QUALITY internalCandidates non è 4.');
        if (Number(data?.profiles?.ultra?.internalCandidates) !== 4) throw new Error('ULTRA internalCandidates non è 4.');
        if (Number(data?.profiles?.ultra?.targetProfessionalScore) !== 92) throw new Error('ULTRA targetProfessionalScore non è 92.');
        if (data?.automaticQualityRepair !== true) throw new Error('automaticQualityRepair non è attivo.');
        report.capabilities = data; console.log(`Music Director V3 pubblico dopo ${attempt} tentativi.`); return data;
      }
    } catch (error) { report.diagnostics.push(`capabilities ${attempt}: ${error instanceof Error ? error.message : String(error)}`); }
    await sleep(4000);
  }
  throw new Error('Music Director V3 non è diventato pubblico entro la finestra di verifica.');
}

async function pollJob(jobId, label) {
  for (let i = 1; i <= MAX_POLLS; i += 1) {
    const data = await json(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?directorV3Canary=${Date.now()}-${i}`, { method: 'GET', headers: { 'Cache-Control': 'no-cache' }, label: `${label} poll` }, [200, 202]);
    const job = jobOf(data); const status = statusOf(data);
    console.log(`${label.toUpperCase()} ${i}/${MAX_POLLS}: ${status} ${Number(job.progress || data?.progress || 0)}%`);
    if (status === 'FAILED') throw new Error(`${label}: job fallito: ${JSON.stringify(job.error || job.message || job).slice(0, 1200)}`);
    if (status === 'COMPLETED') return job;
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: timeout dopo ${MAX_POLLS} poll.`);
}

function assertDirectorResult(label, done, threshold, expected = {}) {
  const urls = audioUrls(done).slice(0, 2);
  const meta = done?.metadata || {};
  const summary = done?.sonaraQualityDirector || done?.data?.sonaraQualityDirector || {};
  const reports = Array.isArray(summary?.reports) ? summary.reports : [];
  const bestScore = Number(meta.bestProfessionalScore ?? summary.bestProfessionalScore ?? 0);
  const generatedCount = Number(meta.generatedCandidateCount || 0);
  const visibleCount = Number(meta.visibleCandidateCount || urls.length);
  if (urls.length !== 2) throw new Error(`${label}: attesi 2 risultati visibili, ricevuti ${urls.length}.`);
  if (!urls.every(isWavUrl)) throw new Error(`${label}: i due master finali non sono WAV reali.`);
  if (generatedCount < 4) throw new Error(`${label}: attesi almeno 4 candidati interni reali, ricevuti ${generatedCount}.`);
  if (visibleCount !== 2) throw new Error(`${label}: visibleCandidateCount=${visibleCount}, atteso 2.`);
  if (meta.automaticCandidateRanking !== true) throw new Error(`${label}: automaticCandidateRanking non attivo.`);
  if (bestScore < threshold) throw new Error(`${label}: bestProfessionalScore ${bestScore}/100 sotto soglia ${threshold}.`);
  if (meta.releaseReady !== true) throw new Error(`${label}: releaseReady non true.`);
  if (!reports.length || !reports.some(item => item?.measuredFromRealWav === true)) throw new Error(`${label}: nessun report misurato dal WAV reale.`);
  const best = reports.slice().sort((a,b) => Number(b?.professionalScore || 0) - Number(a?.professionalScore || 0))[0] || {};
  if (expected.bpm != null && best.bpmPassed !== true) throw new Error(`${label}: BPM lock ${expected.bpm} non superato.`);
  return {
    audioUrls: urls,
    bestProfessionalScore: bestScore,
    generatedCandidateCount: generatedCount,
    visibleCandidateCount: visibleCount,
    requestedBpm: expected.bpm ?? null,
    bpmPassed: expected.bpm == null ? null : best.bpmPassed === true,
    detectedBpm: best.detectedBpm ?? best.bpm ?? null,
    requestedKey: expected.key ?? null,
    keyPassed: best.keyComparable === true ? best.keyPassed === true : null,
    reports: reports.map(item => ({ professionalScore: item?.professionalScore, professionalReleasePassed: item?.professionalReleasePassed, measuredFromRealWav: item?.measuredFromRealWav, bpmPassed: item?.bpmPassed, detectedBpm: item?.detectedBpm ?? item?.bpm ?? null, hardFailureReasons: item?.hardFailureReasons || [] }))
  };
}

async function submitGeneration({ label, genreFamily, genre, subgenre, mood, prompt, bpm, key, weirdness, styleInfluence, profile = 'quality', threshold = 88 }) {
  console.log(`\n=== REAL ${label.toUpperCase()} GENERATION ===`);
  const submitted = await json(`${API}/api/engine/generate`, {
    method: 'POST', headers: h({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({
      title: `SONARA ${label} Canary`, genreFamily, genre, subgenre, mood, rawPrompt: prompt, prompt, lyrics: '', vocalMode: 'instrumental',
      bpm, key, durationSec: 30, weirdness, styleInfluence, candidateCount: 2, dualFast: true,
      generationProfileV3: profile, sonaraMusicDirectorV3: 'sonara-music-director-v3', projectId: PROJECT, profileId: PROFILE, sonaraDirectorV3E2E: true
    }), label: `${label} submit`
  });
  const jobId = String(submitted?.jobId || submitted?.job_id || submitted?.id || '');
  if (!jobId.startsWith('director-v3-')) throw new Error(`${label}: jobId non orchestrato dal Director V3 (${jobId || 'missing'}).`);
  const done = await pollJob(jobId, label);
  const snapshot = assertDirectorResult(label, done, threshold, { bpm, key });
  snapshot.jobId = jobId; snapshot.genre = genre; snapshot.subgenre = subgenre; snapshot.profile = profile;
  return snapshot;
}

async function runProfile(profile, threshold) {
  const prompt = profile === 'ultra'
    ? 'Release-ready deep house instrumental, exact 122 BPM in A minor. Expensive analog character, deep controlled sub, rounded club kick, detailed restrained percussion, warm extended minor chords, dub space, evolving nocturnal pads, memorable two-bar hook, organic micro-variation, strong tension and release, deliberate DJ-friendly ending, natural dynamics, pristine transients, coherent stereo depth. No vocals. No generic EDM. No copy-paste looping.'
    : 'Professional deep house instrumental, exact 122 BPM in A minor. Deep controlled sub bass, rounded club kick, crisp restrained percussion, warm analog minor chords, subtle dub echoes, evolving nocturnal pads, memorable understated motif, tension and release, polished stereo depth, clean transients, deliberate ending. No vocals. Avoid generic EDM and pop structure.';
  report.profiles[profile] = await submitGeneration({ label: `deep-house-${profile}`, genreFamily: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House', mood: 'Deep, dark, emotional, hypnotic, elegant, late-night', prompt, bpm: 122, key: 'A Minor', weirdness: profile === 'ultra' ? 42 : 48, styleInfluence: profile === 'ultra' ? 96 : 92, profile, threshold });
  save();
}

const GENRE_CASES = [
  { id:'tech-house', genreFamily:'Electronic / Dance', genre:'House', subgenre:'Tech House', bpm:126, key:'F Minor', weirdness:42, styleInfluence:94, mood:'Driving, minimal, dark, club-focused', prompt:'Professional Tech House instrumental at exact 126 BPM in F minor. Tight punchy kick, elastic mono bass phrase, pronounced 16th-note shuffle, rolling hats, syncopated percussion, sparse dry stabs, filtered hook fragments, compact DJ arrangement, controlled FX, strong club low end. No lush cinematic pads, no trance supersaws, no pop chord progression.' },
  { id:'afro-house', genreFamily:'Electronic / Dance', genre:'House', subgenre:'Afro House', bpm:120, key:'D Minor', weirdness:50, styleInfluence:94, mood:'Organic, hypnotic, soulful, spiritual', prompt:'Professional Afro House instrumental at exact 120 BPM in D minor. Interlocking polyrhythms, hand drums, shakers, grounded four-on-the-floor kick, deep bass, organic mallets, soulful modal harmony, call-and-response motifs, warm pads, earthy textures, gradual spiritual build and full polyrhythmic return. No generic EDM drop or rigid mechanical percussion.' },
  { id:'trap', genreFamily:'Hip Hop / Rap', genre:'Trap', subgenre:'Trap', bpm:140, key:'C Minor', weirdness:45, styleInfluence:95, mood:'Dark, cinematic, heavy, focused', prompt:'Professional Trap instrumental at exact 140 BPM in C minor. Deep controlled 808, weighty kick relationship, crisp snare, expressive hi-hat subdivisions and rolls, sparse dark keys and bells, strong tonal center, spacious verse pocket, hook lift, selective atmospheric ear candy. No four-on-the-floor house groove, no muddy 808 stacking, no EDM build-up.' },
  { id:'hip-hop', genreFamily:'Hip Hop / Rap', genre:'Hip-Hop / Rap', subgenre:'Boom Bap', bpm:94, key:'E Minor', weirdness:38, styleInfluence:93, mood:'Raw, soulful, confident, head-nod', prompt:'Professional Hip-Hop / Boom Bap instrumental at exact 94 BPM in E minor. Human pocket, punchy kick and snare, swung hats, warm sample-like keys, focused bass, dusty character drums, restrained melodic motif, clear vocal space, intro verse hook second-verse variation final hook outro. No EDM transitions and no overcrowded midrange.' },
  { id:'jungle-dnb', genreFamily:'Electronic / Dance', genre:'Drum & Bass', subgenre:'Jungle / Drum & Bass', bpm:174, key:'G Minor', weirdness:58, styleInfluence:96, mood:'Dark, kinetic, rave, atmospheric', prompt:'Professional Jungle / Drum & Bass instrumental at exact 174 BPM in G minor. Genuine full-time rapid chopped breakbeats, rolling sub bass, clean low end, atmospheric pads, concise dark motif, controlled Reese texture, strong forward motion, tension intro, breakbeat reveal, bass drop, contrast section, evolved second drop. Never reinterpret as half-time; no house groove and no muddy sub layering.' }
];

async function runMultiGenre() {
  for (const item of GENRE_CASES) {
    report.genres[item.id] = await submitGeneration({ ...item, label: item.id, profile: 'quality', threshold: 88 });
    save();
  }
}

async function main() {
  try {
    await waitForCapabilities();
    await runProfile('quality', 88);
    await runProfile('ultra', 92);
    await runMultiGenre();
    report.ok = true; save();
    console.log('\nSONARA MUSIC DIRECTOR V3 MULTI-GENRE REAL CANARY: PASS');
  } catch (error) {
    report.ok = false; report.error = error instanceof Error ? error.message : String(error); save();
    console.error(`\nSONARA MUSIC DIRECTOR V3 MULTI-GENRE CANARY: FAIL\n${report.error}`); process.exitCode = 1;
  }
}

await main();
