import fs from 'node:fs';

const API = String(process.env.API_ORIGIN || 'https://api.sonaraenterprise.com').replace(/\/$/, '');
const WEB = String(process.env.WEB_ORIGIN || 'https://sonaraenterprise.com').replace(/\/$/, '');
const POLL_MS = Math.max(2000, Number(process.env.POLL_MS || 4000));
const MAX_POLLS = Math.max(20, Number(process.env.MAX_POLLS || 90));
const REPORT_PATH = process.env.SONARA_ANTISTALL_REPORT || 'sonara-quality-ultra-antistall-e2e-report.json';
const profiles = ['quality', 'ultra'];
const report = { startedAt: new Date().toISOString(), profiles: {}, diagnostics: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => fs.writeFileSync(REPORT_PATH, `${JSON.stringify({ ...report, finishedAt: new Date().toISOString() }, null, 2)}\n`);

async function jsonRequest(url, init = {}, allowed = [200, 202]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(init.timeoutMs || 180000)) });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`non-JSON HTTP ${response.status}: ${text.slice(0, 220)}`); }
  if (!allowed.includes(response.status)) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 700)}`);
  return { response, data };
}

function jobOf(data) { return data?.job || data?.data || data || {}; }
function statusOf(data) { return String(jobOf(data)?.status || '').toUpperCase(); }
function urlsOf(data) {
  const job = jobOf(data); const out = [];
  const add = v => { const s = String(v || '').trim(); if (/^https:\/\//i.test(s) && !out.includes(s)) out.push(s); };
  add(job.audioUrl); for (const v of job.audioUrls || []) add(v);
  for (const c of job.candidates || []) add(c?.audioUrl || c?.url);
  for (const c of job.outputs || []) add(c?.audioUrl || c?.url);
  return out;
}

async function capabilities() {
  for (let i = 1; i <= 30; i++) {
    try {
      const { data } = await jsonRequest(`${API}/api/music/stability/capabilities?canary=${Date.now()}-${i}`, { headers: { 'Cache-Control': 'no-cache' }, timeoutMs: 12000 });
      if (data?.version === 'sonara-quality-ultra-stability-1' && data?.adaptiveSequentialBatches === true && data?.concurrentBatches === false) return data;
    } catch (error) { console.log(`capabilities ${i}/30: ${error.message}`); }
    await sleep(3000);
  }
  throw new Error('Quality/Ultra Stability Guard non disponibile.');
}

async function runProfile(profile) {
  console.log(`\n=== ${profile.toUpperCase()} ===`);
  const prompt = `Professional ${profile} deep house instrumental, 122 BPM, C minor, warm punchy kick, controlled sub bass, subtle percussion, analog chords, memorable synth motif, evolving arrangement, clean transitions, deliberate ending, release-ready dynamics.`;
  const { data: submit } = await jsonRequest(`${API}/api/engine/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({
      title: `SONARA ${profile.toUpperCase()} Anti-Stall Canary`,
      genreFamily: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House', mood: 'Deep',
      prompt, rawPrompt: prompt, vocalMode: 'instrumental', bpm: 122, key: 'C Minor', durationSec: 30,
      weirdness: 40, styleInfluence: 90, generationProfileV3: profile, renderProfile: profile,
      sonaraAntiStallCanary: true
    })
  });
  const jobId = String(submit?.jobId || submit?.job_id || '');
  if (!jobId.startsWith('stable-qv1-')) throw new Error(`${profile}: job anti-stall non ricevuto: ${jobId || JSON.stringify(submit).slice(0, 500)}`);

  let maxRepeatedHighProgress = 0;
  let highProgressValue = null;
  let currentRepeated = 0;
  const polls = [];
  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    let data;
    try {
      ({ data } = await jsonRequest(`${WEB}/api/music/job/${encodeURIComponent(jobId)}?antiStall=${attempt}-${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, timeoutMs: 45000 }));
    } catch (error) {
      console.log(`${profile} poll ${attempt}: transient ${error.message}`);
      await sleep(POLL_MS);
      continue;
    }
    const job = jobOf(data); const status = statusOf(data); const progress = Number(job.progress || 0);
    polls.push({ attempt, status, progress, stage: job.stage || job.metadata?.currentStage || '' });
    console.log(`${profile} ${attempt}/${MAX_POLLS}: ${status} ${progress}% ${polls.at(-1).stage}`);
    if (progress >= 90 && progress < 100) {
      if (highProgressValue === progress) currentRepeated += 1; else { highProgressValue = progress; currentRepeated = 1; }
      maxRepeatedHighProgress = Math.max(maxRepeatedHighProgress, currentRepeated);
    } else { highProgressValue = null; currentRepeated = 0; }
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(status)) throw new Error(`${profile}: ${status}: ${JSON.stringify(job.error || job).slice(0, 700)}`);
    if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(status)) {
      const meta = job.metadata || {};
      const urls = urlsOf(job);
      if (!urls.length) throw new Error(`${profile}: completato senza audio.`);
      if (meta.adaptiveSequentialBatches !== true || meta.concurrentBatches !== false) throw new Error(`${profile}: marker seriali mancanti: ${JSON.stringify(meta).slice(0, 800)}`);
      if (maxRepeatedHighProgress >= 8) throw new Error(`${profile}: progress alto ripetuto ${maxRepeatedHighProgress} volte, possibile stallo.`);
      report.profiles[profile] = { ok: true, jobId, polls, maxRepeatedHighProgress, audioUrls: urls, metadata: meta };
      return;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${profile}: timeout canary.`);
}

try {
  report.capabilities = await capabilities();
  for (const profile of profiles) await runProfile(profile);
  report.ok = true;
  save();
  console.log('\nQUALITY + ULTRA ANTI-STALL PASS');
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  save();
  console.error(report.error);
  process.exitCode = 1;
}
