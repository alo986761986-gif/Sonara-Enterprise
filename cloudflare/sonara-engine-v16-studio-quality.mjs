import legacyV15, { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_PATH = /^\/api\/music\/job\/(d16pair_[^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/studio-quality-v16/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const MODEL = 'acestep-v15-turbo';
const STUDIO_STEPS = 8;
const STRUCTURE_SHIFT = 3.0;
const DETAIL_SHIFT = 1.0;
const QUERY_TIMEOUT_MS = 30_000;
const SUBMIT_TIMEOUT_MS = 120_000;
const AUDIO_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 15_000;
const MAX_QUERY_FAILURES = 5;
const PROFILE = 'sonara-studio-quality-v16';
const QUALITY_LOCK = 'v16-8step-dual-master';

class SonaraStudioError extends Error {
  constructor(message, status = 502, retryable = false) {
    super(message);
    this.name = 'SonaraStudioError';
    this.status = Number(status) || 502;
    this.retryable = Boolean(retryable);
  }
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function clean(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    PUBLIC_API_ORIGIN
  ]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-ACE-Worker',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-music-quality': PROFILE,
      ...corsHeaders(request)
    }
  });
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function splitWorkerUrls(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map(normalizeBaseUrl)
    .filter(url => /^https?:\/\//i.test(url));
}

function configuredWorkers(env = {}) {
  const urls = splitWorkerUrls(
    env.ACESTEP_WORKER_URLS ||
    env.ACE_STEP_API_URLS ||
    env.SONARA_ACE_STEP_WORKERS ||
    ''
  );
  return urls.slice(0, 4).map((baseUrl, index) => ({
    id: `t4-${index}`,
    baseUrl,
    kind: 'kaggle'
  }));
}

function workerHeaders(env, extra = {}) {
  const headers = { ...extra };
  const apiKey = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

function internalGenerationAuthorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function engineError(error, fallback = 'SONARA Studio generation failed.') {
  if (error instanceof SonaraStudioError) return error;
  const message = error instanceof Error ? error.message : String(error || fallback);
  const timeout = /timeout|timed out|abort/i.test(message);
  return new SonaraStudioError(timeout ? 'SONARA Studio request timed out.' : message, timeout ? 504 : 502, true);
}

async function workerJson(worker, env, path, init = {}, timeoutMs = QUERY_TIMEOUT_MS) {
  let response;
  try {
    response = await fetch(`${worker.baseUrl}${path}`, {
      ...init,
      headers: workerHeaders(env, init.headers || {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw engineError(error, `Worker ${worker.id} non raggiungibile.`);
  }

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new SonaraStudioError(`Worker ${worker.id}: risposta non JSON (HTTP ${response.status}).`, response.status || 502, true);
  }

  if (!response.ok) {
    const message = String(payload?.detail || payload?.error?.message || payload?.error || payload?.message || `HTTP ${response.status}`);
    throw new SonaraStudioError(message, response.status || 502, [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status));
  }
  if (typeof payload?.code === 'number' && payload.code >= 400) {
    throw new SonaraStudioError(String(payload?.error?.message || payload?.error || payload?.message || 'ACE-Step generation failed.'), payload.code, true);
  }
  return payload;
}

async function checkWorker(worker, env) {
  try {
    const health = await workerJson(worker, env, '/health', { method: 'GET', headers: { Accept: 'application/json' } }, HEALTH_TIMEOUT_MS);
    const status = String(health?.data?.status || health?.status || '').toLowerCase();
    if (health?.code === 200 || ['ok', 'ready', 'healthy', 'online', 'success'].includes(status)) return true;
  } catch {}
  try {
    await workerJson(worker, env, '/v1/models', { method: 'GET', headers: { Accept: 'application/json' } }, HEALTH_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function healthyWorkers(env) {
  const workers = configuredWorkers(env);
  const results = await Promise.all(workers.map(async worker => ({ worker, ok: await checkWorker(worker, env) })));
  return results.filter(item => item.ok).map(item => item.worker);
}

function cacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) throw new Error('SONARA Studio job cache unavailable.');
  await caches.default.put(
    new Request(cacheUrl(jobId)),
    new Response(JSON.stringify(context), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': `public, max-age=${JOB_TTL_SECONDS}`
      }
    })
  );
}

async function readJob(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

export function detectVocalLanguage(lyrics, explicit = '') {
  const chosen = clean(explicit).toLowerCase();
  if (chosen && chosen !== 'unknown' && chosen !== 'auto') return chosen;
  const text = ` ${String(lyrics || '').toLowerCase()} `;
  if (!text.trim()) return 'unknown';
  const scores = {
    it: [' che ', ' non ', ' per ', ' con ', ' sono ', ' amore ', ' cuore ', ' questa ', ' della ', ' nella '],
    es: [' que ', ' para ', ' con ', ' amor ', ' corazón ', ' esta ', ' una ', ' por ', ' quiero '],
    fr: [' que ', ' pour ', ' avec ', ' amour ', ' coeur ', ' dans ', ' une ', ' je ', ' toi '],
    de: [' und ', ' ich ', ' nicht ', ' mit ', ' liebe ', ' mein ', ' eine ', ' für ', ' du '],
    en: [' the ', ' and ', ' with ', ' love ', ' you ', ' i ', ' my ', ' in ', ' tonight ', ' heart ']
  };
  let best = 'en';
  let bestScore = -1;
  for (const [language, words] of Object.entries(scores)) {
    const score = words.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  return best;
}

export function structureLyrics(lyrics) {
  const raw = String(lyrics || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  if (/\[(verse|chorus|bridge|pre[- ]?chorus|intro|outro|hook|refrain|instrumental)[^\]]*\]/i.test(raw)) {
    return raw;
  }
  const blocks = raw.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
  if (blocks.length <= 1) return `[Verse 1]\n${raw}`;
  const labels = ['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Bridge', 'Final Chorus', 'Outro'];
  return blocks.map((block, index) => `[${labels[Math.min(index, labels.length - 1)]}]\n${block}`).join('\n\n');
}

function inferTimeSignature(body) {
  const explicit = String(body.timeSignature || body.time_signature || '').trim();
  if (/^(2|3|4|6)(?:\/(?:4|8))?$/.test(explicit)) return explicit.split('/')[0];
  const style = `${body.genre || ''} ${body.subgenre || ''}`.toLowerCase();
  if (/\b(waltz|mazurka|vals|minuet)\b/.test(style)) return '3';
  if (/\b(jig|tarantella|6\/8)\b/.test(style)) return '6';
  if (/\b(polka|2\/4|two[- ]?step)\b/.test(style)) return '2';
  return '4';
}

export function buildStudioPrompt(body = {}) {
  const genre = clean(body.genre, 'Music');
  const subgenre = clean(body.subgenre, genre);
  const mood = clean(body.mood, 'Authentic');
  const duration = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const original = String(body.prompt || '').trim();
  const hasVocals = Boolean(String(body.lyrics || '').trim());
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  const weirdness = Math.round(clamp(body.weirdness, 50, 0, 100));

  const architecture = duration >= 180
    ? 'Use a long-form professional arrangement with a clear opening identity, evolving sections, recurring signature hook or motif, contrast section, final climax and intentional outro. Maintain continuity for the entire song.'
    : 'Use a compact professional arrangement with immediate identity, clear development, a memorable recurring hook or motif, contrast and a resolved ending.';

  const vocalDirection = hasVocals
    ? 'Lead vocal must remain intelligible and emotionally consistent, with stable singer identity, natural phrasing and breathing, controlled sibilance, tasteful doubles or harmonies, and clear separation from the instrumental.'
    : 'Keep the track fully musical and evolving without filler; develop a recognizable instrumental motif and meaningful variation.';

  const styleDirection = styleInfluence >= 70
    ? `Strictly preserve the selected ${subgenre} language, groove, instrumentation and production conventions; do not drift into generic EDM or neighboring genres.`
    : `Keep ${subgenre} clearly recognizable while allowing tasteful supporting details that remain compatible with the selected style.`;

  const creativityDirection = weirdness >= 70
    ? 'Add controlled originality through unusual but musical timbres, transitions or harmonic details; never sacrifice groove, tonality, vocal clarity or song coherence.'
    : 'Prioritize memorable songwriting, natural musicality, coherent harmony, groove and polished production over random experimentation.';

  const production = 'Studio production target: strong transient definition, controlled sub and bass, clear midrange, open high frequencies without harshness, wide but mono-compatible stereo image, depth without washed-out reverb, no clipping, no abrupt level jumps, no accidental silence, no malformed ending.';

  return [
    original,
    `SONARA STUDIO QUALITY V16. Exact style: ${genre} > ${subgenre}. Mood: ${mood}. Target duration: ${duration} seconds.`,
    architecture,
    vocalDirection,
    styleDirection,
    creativityDirection,
    production
  ].filter(Boolean).join('\n\n').slice(0, 12000);
}

export function buildStudioPayload(body = {}, strategy = 'structure', seed = 1) {
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const bpm = Math.round(clamp(body.bpm, 124, 40, 220));
  const lyrics = structureLyrics(body.lyrics || '');
  const basePrompt = buildStudioPrompt({ ...body, lyrics });
  const structure = strategy === 'structure';
  const strategyPrompt = structure
    ? 'MASTER A — STRUCTURE: prioritize macro-arrangement, rhythmic authority, hook recall, section transitions and stable genre identity.'
    : 'MASTER B — DETAIL: prioritize timbral richness, musical micro-detail, expressive phrasing, stereo depth and tasteful variation while preserving the same song brief.';

  return {
    prompt: `${basePrompt}\n\n${strategyPrompt}`.slice(0, 12000),
    lyrics,
    vocal_language: detectVocalLanguage(lyrics, body.vocalLanguage || body.vocal_language || ''),
    bpm,
    key_scale: clean(body.key || body.key_scale, 'C Major'),
    time_signature: inferTimeSignature(body),
    audio_duration: durationSec,
    task_type: 'text2music',
    model: MODEL,
    inference_steps: STUDIO_STEPS,
    guidance_scale: 1.0,
    shift: structure ? STRUCTURE_SHIFT : DETAIL_SHIFT,
    infer_method: 'ode',
    sampler_mode: 'euler',
    use_random_seed: false,
    seed: Math.max(1, Math.floor(Number(seed) || 1)),
    batch_size: 1,
    thinking: false,
    use_format: false,
    use_cot_metas: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: false,
    allow_lm_batch: false,
    use_tiled_decode: durationSec > 90,
    audio_format: 'wav',
    mp3_bitrate: '320k',
    mp3_sample_rate: 48000,
    enable_normalization: true,
    normalization_db: -1.0
  };
}

async function submitOnWorker(worker, env, payload) {
  const response = await workerJson(worker, env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, SUBMIT_TIMEOUT_MS);
  const taskId = response?.data?.task_id;
  if (!taskId) throw new SonaraStudioError(`Worker ${worker.id} non ha restituito task_id.`, 502, true);
  return { workerId: worker.id, baseUrl: worker.baseUrl, taskId: String(taskId), model: MODEL };
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch {
      return [];
    }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function audioRefFromItem(item, worker) {
  if (!item || typeof item !== 'object') return null;
  for (const source of [item.file, item.url]) {
    if (typeof source !== 'string' || !source) continue;
    try {
      const parsed = new URL(source, `${worker.baseUrl}/`);
      const audioPath = parsed.searchParams.get('path');
      if (audioPath) return { workerId: worker.id, path: audioPath };
    } catch {}
    if (source.startsWith('/') && !source.startsWith('/v1/audio')) {
      return { workerId: worker.id, path: source };
    }
  }
  return null;
}

async function startStudioGeneration(request, env, body) {
  const workers = await healthyWorkers(env);
  if (!workers.length) {
    return json(request, {
      status: 'FAILED',
      retryable: true,
      error: 'Nessun worker gratuito ACE-Step Kaggle è raggiungibile.',
      studioQuality: true,
      paidFallbackUsed: false
    }, 503);
  }

  const selected = workers.length >= 2 ? workers.slice(0, 2) : [workers[0], workers[0]];
  const baseSeed = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const payloads = [
    buildStudioPayload(body, 'structure', baseSeed + 7919),
    buildStudioPayload(body, 'detail', baseSeed + 15838)
  ];
  const jobId = `d16pair_${crypto.randomUUID()}`;
  const context = {
    phase: 'starting',
    title: clean(body.title, 'SONARA Track'),
    genre: clean(body.genre, 'Music'),
    subgenre: clean(body.subgenre, clean(body.genre, 'Music')),
    durationSec: payloads[0].audio_duration,
    profile: PROFILE,
    qualityLock: QUALITY_LOCK,
    tasks: [],
    queryFailures: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await storeJob(jobId, context);

  try {
    const submitted = await Promise.all(selected.map((worker, index) => submitOnWorker(worker, env, payloads[index])));
    const tasks = submitted.map((task, index) => ({
      ...task,
      candidate: index === 0 ? 'A' : 'B',
      strategy: index === 0 ? 'structure-master' : 'detail-master',
      shift: payloads[index].shift,
      inferenceSteps: STUDIO_STEPS
    }));
    await storeJob(jobId, { ...context, phase: 'submitted', tasks, updatedAt: Date.now() });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 28,
      metadata: {
        engine: 'SONARA ACE-Step 1.5',
        studioQuality: true,
        studioQualityProfile: PROFILE,
        qualityLock: QUALITY_LOCK,
        renderModel: MODEL,
        inferenceSteps: STUDIO_STEPS,
        sampleRate: 48000,
        normalizedPeakDb: -1.0,
        candidateCount: 2,
        paidFallbackUsed: false,
        candidateStrategies: tasks.map(task => ({ candidate: task.candidate, strategy: task.strategy, shift: task.shift, workerId: task.workerId })),
        currentStage: selected[0].id === selected[1].id
          ? 'SONARA STUDIO V16: due master HQ in coda sulla T4'
          : 'SONARA STUDIO V16: Master A + Master B su due T4'
      }
    }, 202);
  } catch (rawError) {
    const error = engineError(rawError);
    await storeJob(jobId, { ...context, phase: 'failed', error: error.message, retryable: error.retryable, updatedAt: Date.now() });
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: error.retryable,
      error: error.message,
      studioQuality: true,
      paidFallbackUsed: false
    }, error.status);
  }
}

async function pollStudioJob(request, env, jobId) {
  let context = await readJob(jobId);
  if (!context) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'Sessione SONARA Studio scaduta.' }, 410);
  if (context.phase === 'failed') {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: Boolean(context.retryable), error: context.error || 'Generazione fallita.' });
  }
  if (context.phase === 'completed' && Array.isArray(context.audioUrls)) {
    return completedResponse(request, jobId, context, context.audioRefs || []);
  }

  const tasks = Array.isArray(context.tasks) ? context.tasks.slice(0, 2) : [];
  if (tasks.length !== 2) {
    return json(request, { jobId, status: 'PROCESSING', progress: 15, metadata: { studioQuality: true, currentStage: 'SONARA STUDIO V16: preparazione master' } });
  }

  try {
    const queried = await Promise.all(tasks.map(async taskRef => {
      const worker = { id: taskRef.workerId, baseUrl: taskRef.baseUrl, kind: 'kaggle' };
      const data = await workerJson(worker, env, '/query_result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task_id_list: [taskRef.taskId] })
      }, QUERY_TIMEOUT_MS);
      return { taskRef, worker, task: data?.data?.[0] || null };
    }));

    if (queried.some(entry => !entry.task || Number(entry.task.status) === 0)) {
      if (context.queryFailures) {
        context = { ...context, queryFailures: 0, updatedAt: Date.now() };
        await storeJob(jobId, context);
      }
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 78,
        metadata: {
          studioQuality: true,
          inferenceSteps: STUDIO_STEPS,
          currentStage: 'SONARA STUDIO V16: rendering dei due master HQ'
        }
      });
    }

    const failed = queried.find(entry => Number(entry.task.status) !== 1);
    if (failed) {
      const reason = String(failed.task?.error || failed.task?.message || `Master ${failed.taskRef.candidate} non completato.`);
      await storeJob(jobId, { ...context, phase: 'failed', error: reason, retryable: false, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: reason });
    }

    const audioRefs = queried.map(entry => {
      const items = parseItems(entry.task.result);
      return items.map(item => audioRefFromItem(item, entry.worker)).find(Boolean) || null;
    });
    if (audioRefs.some(ref => !ref)) {
      const reason = 'I due master sono terminati ma manca un riferimento audio valido.';
      await storeJob(jobId, { ...context, phase: 'failed', error: reason, retryable: false, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: reason });
    }

    const audioUrls = audioRefs.map(ref => `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`);
    context = { ...context, phase: 'completed', audioRefs, audioUrls, queryFailures: 0, updatedAt: Date.now() };
    await storeJob(jobId, context);
    return completedResponse(request, jobId, context, audioRefs);
  } catch (rawError) {
    const error = engineError(rawError);
    const failures = Number(context.queryFailures || 0) + 1;
    const shouldFail = !error.retryable || failures >= MAX_QUERY_FAILURES;
    context = {
      ...context,
      phase: shouldFail ? 'failed' : context.phase,
      queryFailures: failures,
      error: shouldFail ? error.message : context.error,
      retryable: error.retryable,
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);
    if (shouldFail) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: error.retryable, error: error.message });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 82,
      retryable: true,
      metadata: { studioQuality: true, currentStage: `SONARA STUDIO V16: riconnessione T4 (${failures}/${MAX_QUERY_FAILURES})` }
    });
  }
}

function completedResponse(request, jobId, context) {
  const urls = Array.isArray(context.audioUrls) ? context.audioUrls : [];
  const tasks = Array.isArray(context.tasks) ? context.tasks : [];
  const candidates = urls.map((audioUrl, index) => ({
    id: index === 0 ? 'A' : 'B',
    audioUrl,
    audioFormat: 'wav',
    strategy: tasks[index]?.strategy || (index === 0 ? 'structure-master' : 'detail-master'),
    inferenceSteps: STUDIO_STEPS,
    shift: tasks[index]?.shift ?? (index === 0 ? STRUCTURE_SHIFT : DETAIL_SHIFT)
  }));
  return json(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: urls[0] || null,
    audioUrls: urls,
    candidates,
    metadata: {
      engine: 'SONARA ACE-Step 1.5',
      studioQuality: true,
      studioQualityProfile: PROFILE,
      qualityLock: QUALITY_LOCK,
      renderModel: MODEL,
      inferenceSteps: STUDIO_STEPS,
      sampleRate: 48000,
      normalizationEnabled: true,
      normalizedPeakDb: -1.0,
      candidateCount: candidates.length,
      paidFallbackUsed: false,
      currentStage: '2 master SONARA Studio HQ pronti'
    }
  });
}

async function proxyWorkerAudio(request, env, url) {
  const workerId = String(url.searchParams.get('sonara_worker') || '').trim();
  const path = String(url.searchParams.get('path') || '').trim();
  if (!workerId || !path) return null;
  const worker = configuredWorkers(env).find(candidate => candidate.id === workerId);
  if (!worker) return json(request, { error: `Worker audio ${workerId} non disponibile.` }, 404);
  const target = new URL('/v1/audio', `${worker.baseUrl}/`);
  target.searchParams.set('path', path);
  const headers = workerHeaders(env, {});
  const range = request.headers.get('Range');
  if (range) headers.Range = range;
  let upstream;
  try {
    upstream = await fetch(target.toString(), { method: 'GET', headers, signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS) });
  } catch (rawError) {
    return json(request, { error: engineError(rawError).message, retryable: true }, 502);
  }
  if (!upstream.ok && upstream.status !== 206) {
    const raw = await upstream.text().catch(() => '');
    return json(request, { error: raw || `ACE-Step audio HTTP ${upstream.status}` }, upstream.status || 502);
  }
  const responseHeaders = new Headers(corsHeaders(request));
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set('cache-control', 'private, no-store');
  responseHeaders.set('x-sonara-ace-worker', worker.id);
  responseHeaders.set('x-sonara-music-quality', PROFILE);
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

async function readiness(request, env) {
  const workers = await healthyWorkers(env);
  if (!workers.length) {
    return json(request, {
      ready: false,
      engine: 'SONARA ACE-Step 1.5',
      model: MODEL,
      studioQuality: true,
      workerCount: 0,
      retryable: true
    }, 503);
  }
  return json(request, {
    ready: true,
    engine: 'SONARA ACE-Step 1.5',
    model: MODEL,
    studioQuality: true,
    studioQualityProfile: PROFILE,
    qualityLock: QUALITY_LOCK,
    inferenceSteps: STUDIO_STEPS,
    sampleRate: 48000,
    normalizationEnabled: true,
    paidFallbackUsed: false,
    workerCount: workers.length,
    workers: workers.map(worker => ({ id: worker.id, kind: worker.kind }))
  });
}

async function decorateHealth(request, response, env) {
  const url = new URL(request.url);
  if (!(url.pathname === '/' || url.pathname === '/api/health')) return response;
  let data = {};
  try { data = response.ok ? await response.clone().json() : {}; } catch {}
  const workers = await healthyWorkers(env).catch(() => []);
  return json(request, {
    ...data,
    status: workers.length ? 'ok' : (data.status || 'degraded'),
    sonaraStudioQuality: true,
    studioQualityProfile: PROFILE,
    qualityLock: QUALITY_LOCK,
    studioTurboSteps: STUDIO_STEPS,
    studioSampleRate: 48000,
    studioNormalization: true,
    studioCandidateCount: 2,
    studioCandidateA: 'structure-master / shift 3.0',
    studioCandidateB: 'detail-master / shift 1.0',
    studioPaidFallbackUsed: false,
    aceStepWorkerCount: workers.length || data.aceStepWorkerCount || 0,
    aceStepWorkers: workers.length ? workers.map(worker => ({ id: worker.id, kind: worker.kind })) : data.aceStepWorkers
  }, response.ok ? response.status : (workers.length ? 200 : response.status));
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    const jobMatch = url.pathname.match(JOB_PATH);

    if (jobMatch && request.method === 'GET') {
      return pollStudioJob(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (url.pathname === '/api/modal/audio' && (request.method === 'GET' || request.method === 'HEAD') && url.searchParams.has('sonara_worker')) {
      const proxied = await proxyWorkerAudio(request, env, url);
      if (proxied) return proxied;
    }

    if (url.pathname === '/api/engine/ready' && request.method === 'GET') {
      return readiness(request, env);
    }

    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      if (!internalGenerationAuthorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
      const authoritativeRequest = await rewriteGenerationRequest(request);
      let body;
      try { body = await authoritativeRequest.clone().json(); }
      catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
      if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) {
        return startStudioGeneration(request, env, body);
      }
      return legacyV15.fetch(authoritativeRequest, env, ctx);
    }

    const response = await legacyV15.fetch(request, env, ctx);
    return decorateHealth(request, response, env);
  }
};
