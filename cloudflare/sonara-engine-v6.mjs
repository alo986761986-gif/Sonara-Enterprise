const ENGINE_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/direct-job-v6/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const MAX_PROMPT_CHARS = 12000;
const MAX_LYRICS_CHARS = 4096;
const GENERATION_STALE_MS = 105000;
const PROFESSIONAL_CANDIDATE_COUNT = 2;
const MAX_QUALITY_REGENERATIONS = 2;
const PROFESSIONAL_OUTPUT_FORMAT = 'wav';
const MIN_SAMPLE_RATE = 44100;
const MIN_BITS_PER_SAMPLE = 16;
const MIN_AUDIO_BYTES = 100000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

function config(env) {
  return {
    baseUrl: String(env.ACESTEP_API_URL || ENGINE_DEFAULT_URL).replace(/\/$/, ''),
    key: String(env.MODAL_PROXY_KEY || '').trim(),
    secret: String(env.MODAL_PROXY_SECRET || '').trim()
  };
}

function internalGenerationAuthorized(request, env) {
  const requiredSecret = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (!requiredSecret) return true;
  return String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === requiredSecret;
}

function authHeaders(env, extra = {}) {
  const cfg = config(env);
  return {
    'Modal-Key': cfg.key,
    'Modal-Secret': cfg.secret,
    ...extra
  };
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function resolveCreativeControls(body = {}) {
  const weirdness = Math.round(clamp(body.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  return {
    weirdness,
    styleInfluence,
    lmTemperature: Math.round((0.55 + weirdness * 0.0054) * 1000) / 1000,
    lmCfgScale: Math.round((1.4 + styleInfluence * 0.02) * 1000) / 1000,
    lmTopP: Math.round((0.84 + weirdness * 0.0016) * 1000) / 1000,
    inferMethod: weirdness >= 75 ? 'sde' : 'ode'
  };
}

function timeoutLike(error) {
  if (!(error instanceof Error)) return false;
  const name = String(error.name || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return name.includes('abort') || name.includes('timeout') || message.includes('timeout') || message.includes('aborted');
}

class SonaraEngineError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = 'SonaraEngineError';
    this.status = status;
    this.retryable = retryable;
  }
}

async function engineJson(env, path, init = {}, timeoutMs = 15000) {
  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    throw new SonaraEngineError('SONARA engine credentials are not configured.', 503, false);
  }

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(env),
        ...(init.headers || {})
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new SonaraEngineError(
      timeoutLike(error) ? 'SONARA engine is warming up.' : 'SONARA engine network request failed.',
      0,
      true
    );
  }

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new SonaraEngineError(
        `SONARA returned an invalid response (HTTP ${response.status}).`,
        response.status,
        RETRYABLE_STATUSES.has(response.status)
      );
    }
  }

  if (!response.ok) {
    throw new SonaraEngineError(
      `SONARA HTTP ${response.status}: ${data?.detail || data?.error || data?.message || 'request failed'}`,
      response.status,
      RETRYABLE_STATUSES.has(response.status)
    );
  }

  if (typeof data?.code === 'number' && data.code >= 400) {
    throw new SonaraEngineError(
      String(data?.error || data?.message || 'SONARA request failed.'),
      data.code,
      data.code >= 500 || data.code === 429
    );
  }

  return data;
}

async function engineModelCatalog(env) {
  const data = await engineJson(env, '/v1/models', { method: 'GET' }, 12000);
  const records = Array.isArray(data?.data?.models) ? data.data.models : [];
  const models = records.map(model => cleanField(model?.name, 120)).filter(Boolean);
  return {
    models,
    defaultModel: cleanField(data?.data?.default_model, 120) || models[0] || ''
  };
}

export function chooseProfessionalModel(models, defaultModel = '') {
  const available = Array.isArray(models) ? models.map(value => String(value || '').trim()).filter(Boolean) : [];
  const priorities = [
    /acestep-v15-xl-sft$/i,
    /acestep-v15-xl-turbo$/i,
    /acestep-v15-sft$/i,
    /acestep-v15-turbo$/i,
    /xl-sft/i,
    /xl-turbo/i,
    /sft/i,
    /turbo/i
  ];
  for (const pattern of priorities) {
    const selected = available.find(name => pattern.test(name));
    if (selected) return selected;
  }
  return available.includes(defaultModel) ? defaultModel : (available[0] || defaultModel || '');
}

async function modelReady(env) {
  try {
    return (await engineModelCatalog(env)).models.length > 0;
  } catch (error) {
    if (error instanceof SonaraEngineError && error.retryable) return false;
    return false;
  }
}

async function warmModel(env) {
  try { await modelReady(env); } catch {}
}

function jobCacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) {
    throw new SonaraEngineError('SONARA job storage is unavailable.', 503, true);
  }
  await caches.default.put(
    new Request(jobCacheUrl(jobId)),
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
    const response = await caches.default.match(new Request(jobCacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

function cleanField(value, maxLength = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function inferTimeSignature(value, genre = '', subgenre = '') {
  const explicit = cleanField(value, 10).replace(/\s+/g, '');
  const explicitMatch = explicit.match(/^(2|3|4|6)(?:\/(?:4|8))?$/);
  if (explicitMatch) return explicitMatch[1];

  const style = `${genre} ${subgenre}`.toLocaleLowerCase('en-US');
  if (/\b(waltz|mazurka|sarabande|minuet|polonaise|vals)\b/.test(style)) return '3';
  if (/\b(6\/8|six[- ]?eight|jig|tarantella)\b/.test(style)) return '6';
  if (/\b(polka|two[- ]?step|2\/4)\b/.test(style)) return '2';
  return '4';
}

function pulseBeatsPerBar(timeSignature) {
  if (String(timeSignature) === '3') return 3;
  if (String(timeSignature) === '2' || String(timeSignature) === '6') return 2;
  return 4;
}

export function alignDurationToCompleteBars(durationSec, bpm, timeSignature = '4') {
  const safeDuration = clamp(durationSec, 30, 10, 600);
  const safeBpm = clamp(bpm, 124, 30, 300);
  const secondsPerBar = pulseBeatsPerBar(timeSignature) * 60 / safeBpm;
  const bars = Math.max(1, Math.round(safeDuration / secondsPerBar));
  return Math.round(bars * secondsPerBar * 1000) / 1000;
}

export function buildProfessionalEnginePayload(payload, model = '') {
  const selectedModel = cleanField(model, 120);
  const turbo = !selectedModel || /turbo/i.test(selectedModel);
  const lmTemperature = clamp(payload?.lm_temperature, 0.72, 0.1, 2);
  const lmCfgScale = clamp(payload?.lm_cfg_scale, 3.0, 1, 6);
  const lmTopP = clamp(payload?.lm_top_p, 0.9, 0.1, 1);
  const inferMethod = payload?.infer_method === 'sde' ? 'sde' : 'ode';
  const professional = {
    ...payload,
    ...(selectedModel ? { model: selectedModel } : {}),
    inference_steps: turbo ? 8 : 50,
    thinking: true,
    use_format: false,
    use_cot_caption: true,
    use_cot_language: true,
    constrained_decoding: true,
    allow_lm_batch: true,
    lm_temperature: lmTemperature,
    lm_cfg_scale: lmCfgScale,
    lm_top_p: lmTopP,
    lm_repetition_penalty: 1.05,
    lm_negative_prompt: 'genre drift, wrong instruments, incorrect tempo, incorrect key, malformed structure, clipping, silence, unfinished ending',
    batch_size: PROFESSIONAL_CANDIDATE_COUNT,
    infer_method: inferMethod,
    audio_format: PROFESSIONAL_OUTPUT_FORMAT
  };

  if (!turbo) {
    professional.guidance_scale = 7.0;
    professional.shift = 1.0;
    professional.use_adg = true;
  }
  return professional;
}

function promptContains(prompt, value) {
  return prompt.toLocaleLowerCase('en-US').includes(value.toLocaleLowerCase('en-US'));
}

export function validateGenerationRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SonaraEngineError('Generation request must be a JSON object.', 400, false);
  }

  const prompt = String(body.prompt ?? '').trim();
  const rawPrompt = cleanField(body.rawPrompt, 1000);
  const genreFamily = cleanField(body.genreFamily);
  const genre = cleanField(body.genre);
  const subgenre = cleanField(body.subgenre);
  const mood = cleanField(body.mood, 80);
  const key = cleanField(body.key || body.key_scale, 40);
  const title = cleanField(body.title, 160);
  const bpm = Math.round(clamp(body.bpm, 124, 40, 220));
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const creativeControls = resolveCreativeControls(body);
  const timeSignature = inferTimeSignature(body.timeSignature || body.time_signature, genre, subgenre);
  const lyrics = String(body.lyrics || '').trim().slice(0, MAX_LYRICS_CHARS);
  const requestedVocalMode = cleanField(body.vocalMode, 20).toLowerCase();
  const vocalMode = requestedVocalMode || (lyrics ? 'unspecified' : 'instrumental');
  const errors = [];

  if (!rawPrompt) errors.push('rawPrompt is required');
  if (!genreFamily) errors.push('genreFamily is required');
  if (!genre) errors.push('genre is required');
  if (!subgenre) errors.push('subgenre is required');
  if (!mood) errors.push('mood is required');
  if (!key) errors.push('key is required');
  if (!prompt) errors.push('prompt is required');
  if (prompt.length > MAX_PROMPT_CHARS) errors.push(`prompt exceeds ${MAX_PROMPT_CHARS} characters`);
  if (!['instrumental', 'male', 'female', 'duet', 'unspecified'].includes(vocalMode)) errors.push(`unsupported vocalMode: ${vocalMode}`);

  for (const [label, value] of [['genreFamily', genreFamily], ['genre', genre], ['subgenre', subgenre], ['mood', mood], ['key', key]]) {
    if (value && prompt && !promptContains(prompt, value)) errors.push(`prompt does not contain selected ${label}: ${value}`);
  }
  if (prompt && !promptContains(prompt, `${bpm} BPM`)) errors.push(`prompt does not contain selected BPM: ${bpm}`);
  if (prompt && !promptContains(prompt, `${durationSec} seconds`)) errors.push(`prompt does not contain selected duration: ${durationSec} seconds`);
  if (vocalMode === 'instrumental' && lyrics) errors.push('instrumental mode cannot include lyrics');
  if (vocalMode === 'instrumental' && prompt && !promptContains(prompt, 'Strictly instrumental')) errors.push('instrumental requests must explicitly forbid vocals');
  if (vocalMode !== 'instrumental' && !lyrics) errors.push(`${vocalMode} vocal mode requires lyrics`);
  if (vocalMode !== 'instrumental' && prompt && promptContains(prompt, 'Strictly instrumental')) errors.push('vocal requests cannot be marked strictly instrumental');
  if (vocalMode === 'male' && prompt && !promptContains(prompt, 'male lead vocalist')) errors.push('male vocal mode must explicitly request a male lead vocalist');
  if (vocalMode === 'female' && prompt && !promptContains(prompt, 'female lead vocalist')) errors.push('female vocal mode must explicitly request a female lead vocalist');
  if (vocalMode === 'duet' && prompt && (!promptContains(prompt, 'two clearly distinct lead vocalists') || !promptContains(prompt, 'one male and one female'))) errors.push('duet mode must explicitly request distinct male and female lead vocalists');
  if (lyrics && prompt && !prompt.includes(lyrics)) errors.push('prompt does not preserve the supplied lyrics exactly');

  if (errors.length) {
    throw new SonaraEngineError(`Generation quality gate failed: ${errors.join('; ')}.`, 400, false);
  }

  return {
    prompt,
    rawPrompt,
    genreFamily,
    genre,
    subgenre,
    mood,
    key,
    title,
    bpm,
    durationSec,
    weirdness: creativeControls.weirdness,
    styleInfluence: creativeControls.styleInfluence,
    timeSignature,
    lyrics,
    vocalMode,
    qualityGate: {
      valid: true,
      status: 'PASSED',
      policy: 'deterministic-generation-v2-professional',
      checkedFields: ['rawPrompt', 'genreFamily', 'genre', 'subgenre', 'mood', 'bpm', 'key', 'durationSec', 'timeSignature', 'vocalMode', 'lyrics']
    }
  };
}

export function normalizeRequest(body) {
  const spec = validateGenerationRequest(body);
  const renderDurationSec = alignDurationToCompleteBars(spec.durationSec, spec.bpm, spec.timeSignature);
  const creativeControls = resolveCreativeControls(spec);
  const basePayload = {
    // The frontend prompt is authoritative. Do not prepend, concatenate or replace it.
    prompt: spec.prompt,
    lyrics: spec.lyrics,
    vocal_language: String(body.vocalLanguage || body.vocal_language || 'unknown'),
    bpm: spec.bpm,
    key_scale: spec.key,
    time_signature: spec.timeSignature,
    audio_duration: renderDurationSec,
    use_random_seed: true,
    seed: -1,
    task_type: 'text2music',
    lm_temperature: creativeControls.lmTemperature,
    lm_cfg_scale: creativeControls.lmCfgScale,
    lm_top_p: creativeControls.lmTopP,
    infer_method: creativeControls.inferMethod,
    mp3_bitrate: '320k',
    mp3_sample_rate: 48000
  };
  return {
    payload: buildProfessionalEnginePayload(basePayload),
    qualityGate: spec.qualityGate,
    generationSpec: {
      rawPrompt: spec.rawPrompt,
      genreFamily: spec.genreFamily,
      genre: spec.genre,
      subgenre: spec.subgenre,
      mood: spec.mood,
      bpm: spec.bpm,
      key: spec.key,
      durationSec: spec.durationSec,
      weirdness: spec.weirdness,
      styleInfluence: spec.styleInfluence,
      requestedDurationSec: spec.durationSec,
      renderDurationSec,
      timeSignature: spec.timeSignature,
      outputFormat: PROFESSIONAL_OUTPUT_FORMAT,
      candidateCount: PROFESSIONAL_CANDIDATE_COUNT,
      vocalMode: spec.vocalMode,
      hasLyrics: Boolean(spec.lyrics),
      lyrics: spec.lyrics,
      title: spec.title
    }
  };
}

async function releaseTask(env, payload) {
  const data = await engineJson(env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, 110000);

  const taskId = data?.data?.task_id;
  if (!taskId) {
    throw new SonaraEngineError('SONARA did not return a generation task.', 502, false);
  }
  return String(taskId);
}

function parseResultItems(value) {
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

function audioPathFromItem(item, env) {
  if (!item || typeof item !== 'object') return '';
  const directFile = typeof item.file === 'string' ? item.file : '';
  const sourceUrl = typeof item.url === 'string' ? item.url : '';

  for (const source of [sourceUrl, directFile]) {
    if (!source) continue;
    try {
      const parsed = new URL(source, config(env).baseUrl);
      const path = parsed.searchParams.get('path');
      if (path) return path;
    } catch {}
  }
  return directFile && !directFile.includes('?path=') ? directFile : '';
}

function normalizeKeyScale(value) {
  let key = String(value || '').trim().toLocaleLowerCase('en-US')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/\bmaj(?:or)?\b/g, 'major')
    .replace(/\bmin(?:or)?\b/g, 'minor');
  const shortMinor = key.match(/^([a-g](?:#|b)?)m$/);
  if (shortMinor) key = `${shortMinor[1]}minor`;
  return key.replace(/[^a-z0-9#]+/g, '');
}

function candidateMetas(item) {
  return item?.metas && typeof item.metas === 'object'
    ? item.metas
    : (item?.metadata && typeof item.metadata === 'object' ? item.metadata : {});
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function scoreGenerationCandidate(item, spec, index = 0) {
  const errors = [];
  const warnings = [];
  const metas = candidateMetas(item);
  const prompt = String(item?.prompt || item?.caption || '');
  const genres = String(metas.genres || metas.genre || item?.genres || '');
  const promptEvidence = prompt.toLocaleLowerCase('en-US');
  const genreEvidence = genres.toLocaleLowerCase('en-US');
  const expectedSubgenre = String(spec?.subgenre || '').toLocaleLowerCase('en-US');
  const expectedGenre = String(spec?.genre || '').toLocaleLowerCase('en-US');
  const bpm = finiteNumber(metas.bpm ?? item?.bpm);
  const duration = finiteNumber(metas.duration ?? metas.audio_duration ?? item?.duration);
  const key = String(metas.keyscale || metas.key_scale || metas.key || item?.key_scale || '');
  const lyrics = String(item?.lyrics || '');
  const expectedDuration = finiteNumber(spec?.renderDurationSec ?? spec?.durationSec);
  let score = 100;

  if (!item || typeof item !== 'object') errors.push('candidate is not an object');
  if (!String(item?.file || item?.url || '').trim()) errors.push('candidate has no audio file');
  if (expectedSubgenre && promptEvidence && !promptEvidence.includes(expectedSubgenre)) errors.push(`candidate prompt conflicts with subgenre ${spec.subgenre}`);
  else if (expectedSubgenre && !promptEvidence && !genreEvidence.includes(expectedSubgenre)) warnings.push(`candidate response omitted the ${spec.subgenre} style echo`);
  if (expectedGenre && expectedGenre !== expectedSubgenre && !`${promptEvidence} ${genreEvidence}`.includes(expectedGenre)) warnings.push(`candidate does not repeat genre ${spec.genre}`);

  if (bpm === null) warnings.push('candidate response omitted BPM metadata');
  else {
    const deviation = Math.abs(bpm - Number(spec?.bpm));
    score -= Math.min(20, deviation * 4);
    if (deviation > 2) errors.push(`candidate BPM ${bpm} differs from ${spec.bpm}`);
  }

  if (duration === null || expectedDuration === null) warnings.push('candidate response omitted duration metadata');
  else {
    const deviation = Math.abs(duration - expectedDuration);
    score -= Math.min(20, deviation * 3);
    if (deviation > 2) errors.push(`candidate duration ${duration} differs from ${expectedDuration}`);
  }

  if (!key) warnings.push('candidate response omitted key metadata');
  else if (normalizeKeyScale(key) !== normalizeKeyScale(spec?.key)) errors.push(`candidate key ${key} differs from ${spec.key}`);

  if (spec?.hasLyrics && lyrics !== String(spec?.lyrics || '')) errors.push('candidate does not preserve lyrics exactly');
  const instrumentalMarker = /^\[?\s*(?:instrumental(?:\s+only)?|no\s+vocals?)\s*\]?$/i;
  if (!spec?.hasLyrics && lyrics.trim() && !instrumentalMarker.test(lyrics.trim())) errors.push('instrumental candidate unexpectedly contains lyrics');

  score -= warnings.length * 3;
  score -= errors.length * 15;
  return {
    index,
    valid: errors.length === 0,
    score: Math.max(0, Math.round(score * 10) / 10),
    errors,
    warnings,
    metrics: { bpm, duration, key, model: cleanField(item?.dit_model || item?.model, 120) }
  };
}

export function evaluateGenerationCandidates(outputs, spec) {
  const items = Array.isArray(outputs) ? outputs : [];
  const reports = items.map((item, index) => scoreGenerationCandidate(item, spec, index));
  const ranked = reports
    .filter(report => report.valid)
    .sort((left, right) => right.score - left.score)
    .map(report => ({ report, item: items[report.index] }));
  return { reports, ranked };
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function parseWavHeader(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    return { valid: false, error: 'not a RIFF/WAVE file' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format = null;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const contentOffset = offset + 8;
    if (id === 'fmt ' && contentOffset + Math.min(size, 40) <= bytes.length && size >= 16) {
      const containerFormat = view.getUint16(contentOffset, true);
      const subFormat = containerFormat === 0xfffe && size >= 40
        ? view.getUint16(contentOffset + 24, true)
        : containerFormat;
      format = {
        audioFormat: subFormat,
        containerFormat,
        channels: view.getUint16(contentOffset + 2, true),
        sampleRate: view.getUint32(contentOffset + 4, true),
        byteRate: view.getUint32(contentOffset + 8, true),
        blockAlign: view.getUint16(contentOffset + 12, true),
        bitsPerSample: view.getUint16(contentOffset + 14, true)
      };
    }
    if (id === 'data') {
      dataOffset = contentOffset;
      dataSize = size;
      break;
    }
    offset = contentOffset + size + (size % 2);
  }

  if (!format || !dataOffset || !dataSize || !format.byteRate) {
    return { valid: false, error: 'WAV header is missing fmt or data metadata' };
  }

  return {
    valid: true,
    ...format,
    dataOffset,
    dataSize,
    durationSec: Math.round(dataSize / format.byteRate * 1000) / 1000
  };
}

function pcmSample(view, offset, bitsPerSample, audioFormat) {
  if (audioFormat === 3 && bitsPerSample === 32) return view.getFloat32(offset, true);
  if (audioFormat !== 1) return null;
  if (bitsPerSample === 16) return view.getInt16(offset, true) / 32768;
  if (bitsPerSample === 24) {
    let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8388608;
  }
  if (bitsPerSample === 32) return view.getInt32(offset, true) / 2147483648;
  return null;
}

export function analyzePcmSamples(value, format) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bytesPerSample = Math.max(1, Math.floor(Number(format?.bitsPerSample || 0) / 8));
  const blockAlign = Number(format?.blockAlign || (bytesPerSample * Number(format?.channels || 1)));
  if (!bytesPerSample || !blockAlign || ![1, 3].includes(Number(format?.audioFormat))) {
    return { valid: false, error: 'unsupported PCM sample format' };
  }

  let samples = 0;
  let sumSquares = 0;
  let sum = 0;
  let peak = 0;
  let clipped = 0;
  for (let frame = 0; frame + blockAlign <= bytes.length; frame += blockAlign) {
    for (let channel = 0; channel < Number(format.channels || 1); channel += 1) {
      const offset = frame + channel * bytesPerSample;
      const sample = pcmSample(view, offset, Number(format.bitsPerSample), Number(format.audioFormat));
      if (sample === null || !Number.isFinite(sample)) continue;
      const absolute = Math.abs(sample);
      samples += 1;
      sum += sample;
      sumSquares += sample * sample;
      peak = Math.max(peak, absolute);
      if (absolute >= 0.999) clipped += 1;
    }
  }

  if (!samples) return { valid: false, error: 'no decodable PCM samples' };
  const rms = Math.sqrt(sumSquares / samples);
  return {
    valid: true,
    sampleCount: samples,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    clippingRatio: clipped / samples,
    dcOffset: sum / samples
  };
}

async function readLimitedBody(response, maxBytes) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read();
      if (value?.length) {
        const take = value.subarray(0, Math.min(value.length, maxBytes - total));
        chunks.push(take);
        total += take.length;
      }
      if (done) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function engineAudioResponse(env, audioPath, init = {}, timeoutMs = 15000) {
  const cfg = config(env);
  return fetch(`${cfg.baseUrl}/v1/audio?path=${encodeURIComponent(audioPath)}`, {
    ...init,
    headers: authHeaders(env, init.headers || {}),
    signal: AbortSignal.timeout(timeoutMs)
  });
}

async function verifyGeneratedWav(env, audioPath, spec) {
  const errors = [];
  const warnings = [];
  let download;
  try {
    download = await engineAudioResponse(env, audioPath, {
      method: 'GET',
      headers: { Range: 'bytes=0-65535' }
    });
  } catch (error) {
    return { passed: false, score: 0, errors: [`audio download failed: ${error instanceof Error ? error.message : String(error)}`], warnings, metrics: {} };
  }

  const contentType = String(download.headers.get('content-type') || '').toLocaleLowerCase('en-US');
  const contentRange = String(download.headers.get('content-range') || '');
  const rangeTotal = contentRange.match(/\/(\d+)\s*$/)?.[1];
  const contentLength = finiteNumber(rangeTotal ?? (download.status === 206 ? null : download.headers.get('content-length')));
  if (!download.ok && download.status !== 206) errors.push(`audio resource returned HTTP ${download.status}`);
  const expectedDuration = Number(spec.renderDurationSec || spec.durationSec || 0);
  const minimumBytes = Math.max(MIN_AUDIO_BYTES, Math.round(expectedDuration * 8000));
  if (contentLength !== null && contentLength < minimumBytes) errors.push(`audio file is too small: ${contentLength} bytes`);
  if (contentLength === null) warnings.push('download response omitted total file size');

  let headerBytes = new Uint8Array();
  try {
    if (download.ok || download.status === 206) headerBytes = await readLimitedBody(download, 65536);
    else await download.body?.cancel();
  } catch (error) {
    errors.push(`audio header read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const header = parseWavHeader(headerBytes);
  if (!header.valid) {
    errors.push(header.error);
    if (!contentType.startsWith('audio/')) errors.push(`invalid audio MIME type: ${contentType || 'missing'}`);
  } else if (!contentType.startsWith('audio/')) {
    warnings.push(`download used a generic MIME type (${contentType || 'missing'}); RIFF/WAVE signature verified`);
  }
  else {
    if (header.sampleRate < MIN_SAMPLE_RATE) errors.push(`sample rate ${header.sampleRate} is below ${MIN_SAMPLE_RATE}`);
    if (header.channels < 2) errors.push('professional master must be stereo');
    if (header.bitsPerSample < MIN_BITS_PER_SAMPLE) errors.push(`bit depth ${header.bitsPerSample} is below ${MIN_BITS_PER_SAMPLE}`);
    const secondsPerBar = pulseBeatsPerBar(spec.timeSignature) * 60 / Number(spec.bpm || 124);
    const durationTolerance = Math.max(2, secondsPerBar / 2 + 0.1);
    if (Math.abs(header.durationSec - expectedDuration) > durationTolerance) {
      errors.push(`WAV duration ${header.durationSec}s differs from target ${expectedDuration}s`);
    }
  }

  let signal = null;
  if (header.valid) {
    const alignedMidpoint = header.dataOffset + Math.floor((header.dataSize * 0.45) / header.blockAlign) * header.blockAlign;
    try {
      const response = await engineAudioResponse(env, audioPath, {
        method: 'GET',
        headers: { Range: `bytes=${alignedMidpoint}-${alignedMidpoint + 131071}` }
      });
      if (response.status === 206) {
        signal = analyzePcmSamples(await readLimitedBody(response, 131072), header);
      } else {
        warnings.push('engine did not provide a midpoint byte range; signal analysis was skipped');
        try { await response.body?.cancel(); } catch {}
      }
    } catch (error) {
      warnings.push(`signal analysis unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (signal?.valid) {
    if (signal.rmsDb < -70) errors.push(`audio is effectively silent (${signal.rmsDb.toFixed(1)} dBFS RMS)`);
    if (signal.peakDb < -55) errors.push(`audio signal is too weak (${signal.peakDb.toFixed(1)} dBFS peak)`);
    if (signal.clippingRatio > 0.03) errors.push(`audio clipping ratio is excessive (${(signal.clippingRatio * 100).toFixed(2)}%)`);
    if (Math.abs(signal.dcOffset) > 0.2) errors.push(`audio DC offset is excessive (${signal.dcOffset.toFixed(3)})`);
  } else if (signal && !signal.valid) {
    errors.push(signal.error);
  }

  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);
  return {
    passed: errors.length === 0 && score >= 85,
    score,
    errors,
    warnings,
    metrics: {
      contentType,
      contentLength,
      sampleRate: header.valid ? header.sampleRate : null,
      channels: header.valid ? header.channels : null,
      bitsPerSample: header.valid ? header.bitsPerSample : null,
      durationSec: header.valid ? header.durationSec : null,
      rmsDb: signal?.valid ? Math.round(signal.rmsDb * 10) / 10 : null,
      peakDb: signal?.valid ? Math.round(signal.peakDb * 10) / 10 : null,
      clippingRatio: signal?.valid ? signal.clippingRatio : null
    }
  };
}

export function summarizeQualityDiagnostics(diagnostics) {
  const reasons = [];
  for (const report of Array.isArray(diagnostics) ? diagnostics : []) {
    for (const reason of [...(report?.errors || []), ...(report?.audioGate?.errors || [])]) {
      const clean = cleanField(reason, 180);
      if (clean && !reasons.includes(clean)) reasons.push(clean);
    }
  }
  return reasons.slice(0, 6).join('; ');
}

async function queryTask(env, taskId, generationSpec) {
  const data = await engineJson(env, '/query_result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task_id_list: [taskId] })
  }, 15000);

  const item = data?.data?.[0];
  if (!item || Number(item.status) === 0) return { state: 'processing' };

  if (Number(item.status) !== 1) {
    return { state: 'failed', error: 'SONARA generation did not complete successfully.' };
  }

  const outputs = parseResultItems(item.result);
  const evaluation = evaluateGenerationCandidates(outputs, generationSpec);
  const diagnostics = [...evaluation.reports];

  for (const candidate of evaluation.ranked) {
    const audioPath = audioPathFromItem(candidate.item, env);
    if (!audioPath) continue;
    const audioGate = await verifyGeneratedWav(env, audioPath, generationSpec);
    diagnostics[candidate.report.index] = { ...candidate.report, audioGate };
    if (!audioGate.passed) continue;
    return {
      state: 'completed',
      audioPath,
      audioUrl: `${PUBLIC_API_ORIGIN}/api/modal/audio?path=${encodeURIComponent(audioPath)}`,
      candidateIndex: candidate.report.index,
      outputQualityGate: {
        valid: true,
        status: 'PASSED',
        policy: 'professional-audio-v2',
        score: Math.min(candidate.report.score, audioGate.score),
        candidateCount: outputs.length,
        metadataGate: candidate.report,
        audioGate
      }
    };
  }

  const rejectionReasons = summarizeQualityDiagnostics(diagnostics);
  return {
    state: 'quality_rejected',
    error: `SONARA rejected every generated candidate because the real audio did not pass the professional quality gate.${rejectionReasons ? ` Reasons: ${rejectionReasons}.` : ''}`,
    diagnostics
  };
}

async function generate(request, env, ctx) {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

  let normalized;
  try {
    normalized = normalizeRequest(body);
  } catch (error) {
    const status = error instanceof SonaraEngineError && error.status ? error.status : 400;
    return json(request, {
      error: error instanceof Error ? error.message : 'Generation quality gate failed.',
      qualityGate: { valid: false, status: 'REJECTED' }
    }, status);
  }

  const { payload, qualityGate, generationSpec } = normalized;
  const jobId = `d6_${crypto.randomUUID()}`;

  try {
    await storeJob(jobId, {
      phase: 'queued',
      payload,
      qualityGate,
      generationSpec,
      requestedDuration: payload.audio_duration,
      taskId: null,
      generationAttempts: 0,
      qualityRegenerations: 0,
      rejectedQualityReports: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  } catch (error) {
    return json(request, {
      error: error instanceof Error ? error.message : 'SONARA could not create the generation job.',
      retryable: true
    }, 503);
  }

  if (ctx?.waitUntil) ctx.waitUntil(warmModel(env));

  return json(request, {
    jobId,
    status: 'PROCESSING',
    progress: 5,
    metadata: {
      engine: 'SONARA',
      duration: payload.audio_duration,
      qualityGate,
      generationSpec,
      transport: 'direct production API',
      currentStage: 'SONARA: preparing generation'
    }
  }, 202);
}

async function processJob(request, env, jobId, context) {
  if (context.phase === 'completed' && context.audioUrl) {
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: context.audioUrl,
      metadata: {
        engine: 'SONARA',
        duration: context.requestedDuration,
        audioUrl: context.audioUrl,
        qualityGate: context.qualityGate,
        outputQualityGate: context.outputQualityGate,
        audioFormat: context.generationSpec?.outputFormat || PROFESSIONAL_OUTPUT_FORMAT,
        generationSpec: context.generationSpec,
        currentStage: 'Audio ready'
      }
    });
  }

  if (context.phase === 'failed') {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: context.error || 'SONARA generation failed.'
    });
  }

  if (!context.taskId) {
    const startedAt = Number(context.generationStartedAt || 0);
    if (context.phase === 'generating' && startedAt && Date.now() - startedAt < GENERATION_STALE_MS) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 30,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: generating audio' }
      });
    }

    let catalog;
    try {
      catalog = await engineModelCatalog(env);
    } catch {
      catalog = { models: [], defaultModel: '' };
    }
    if (!catalog.models.length) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 15,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: engine warming up' }
      });
    }

    const attempts = Number(context.generationAttempts || 0);
    const selectedModel = chooseProfessionalModel(catalog.models, catalog.defaultModel);
    const professionalPayload = buildProfessionalEnginePayload(context.payload, selectedModel);
    context = {
      ...context,
      phase: 'generating',
      payload: professionalPayload,
      selectedModel,
      generationAttempts: attempts + 1,
      generationStartedAt: Date.now(),
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);

    try {
      const taskId = await releaseTask(env, professionalPayload);
      context = {
        ...context,
        phase: 'submitted',
        taskId,
        updatedAt: Date.now()
      };
      await storeJob(jobId, context);
    } catch (error) {
      const retryable = error instanceof SonaraEngineError && error.retryable;
      if (retryable && Number(context.generationAttempts || 0) < 5) {
        context = {
          ...context,
          phase: 'queued',
          generationStartedAt: 0,
          updatedAt: Date.now()
        };
        await storeJob(jobId, context);
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 20,
          metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: retrying generation automatically' }
        });
      }

      const message = error instanceof Error ? error.message : 'SONARA generation failed.';
      await storeJob(jobId, { ...context, phase: 'failed', error: message, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, error: message }, 502);
    }
  }

  try {
    const result = await queryTask(env, String(context.taskId), context.generationSpec);
    if (result.state === 'processing') {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 90,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: finalizing audio' }
      });
    }

    if (result.state === 'failed') {
      await storeJob(jobId, { ...context, phase: 'failed', error: result.error, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, error: result.error }, 502);
    }

    if (result.state === 'quality_rejected') {
      const qualityRegenerations = Number(context.qualityRegenerations || 0);
      const rejectedQualityReports = [
        ...(Array.isArray(context.rejectedQualityReports) ? context.rejectedQualityReports : []),
        { taskId: context.taskId, diagnostics: result.diagnostics, rejectedAt: Date.now() }
      ].slice(-MAX_QUALITY_REGENERATIONS);

      if (qualityRegenerations < MAX_QUALITY_REGENERATIONS) {
        const retryContext = {
          ...context,
          phase: 'queued',
          taskId: null,
          generationStartedAt: 0,
          qualityRegenerations: qualityRegenerations + 1,
          rejectedQualityReports,
          updatedAt: Date.now()
        };
        await storeJob(jobId, retryContext);
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 92,
          metadata: {
            engine: 'SONARA',
            qualityGate: context.qualityGate,
            generationSpec: context.generationSpec,
            qualityRegenerations: retryContext.qualityRegenerations,
            currentStage: 'SONARA: candidate rejected by the real-audio quality gate; regenerating automatically'
          }
        });
      }

      const error = `${result.error} Maximum professional regeneration attempts reached.`;
      await storeJob(jobId, { ...context, phase: 'failed', error, rejectedQualityReports, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, error, outputQualityGate: { valid: false, status: 'REJECTED', diagnostics: result.diagnostics } }, 502);
    }

    const completed = {
      ...context,
      phase: 'completed',
      audioPath: result.audioPath,
      audioUrl: result.audioUrl,
      outputQualityGate: result.outputQualityGate,
      selectedCandidateIndex: result.candidateIndex,
      updatedAt: Date.now()
    };
    await storeJob(jobId, completed);

    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: result.audioUrl,
      metadata: {
        engine: 'SONARA',
        duration: context.requestedDuration,
        audioUrl: result.audioUrl,
        qualityGate: context.qualityGate,
        outputQualityGate: result.outputQualityGate,
        audioFormat: context.generationSpec?.outputFormat || PROFESSIONAL_OUTPUT_FORMAT,
        model: context.selectedModel || 'ACE-Step 1.5',
        selectedCandidateIndex: result.candidateIndex,
        generationSpec: context.generationSpec,
        currentStage: 'Audio ready'
      }
    });
  } catch (error) {
    if (error instanceof SonaraEngineError && error.retryable) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 90,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: finalizing audio' }
      });
    }
    const message = error instanceof Error ? error.message : 'SONARA generation failed.';
    return json(request, { jobId, status: 'FAILED', progress: 0, error: message }, 502);
  }
}

async function job(request, env, jobId) {
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
  if (!jobId.startsWith('d6_')) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'SONARA generation session belongs to an older engine version. Please generate the track again.'
    }, 410);
  }

  const context = await readJob(jobId);
  if (!context) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'SONARA generation session expired. Please generate the track again.'
    }, 410);
  }

  return processJob(request, env, jobId, context);
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(request, { error: 'Method not allowed' }, 405);
  }

  const audioPath = url.searchParams.get('path');
  if (!audioPath) return json(request, { error: 'Missing audio path.' }, 400);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    return json(request, { error: 'SONARA engine credentials are not configured.' }, 503);
  }

  const headers = authHeaders(env);
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  const response = await fetch(`${cfg.baseUrl}/v1/audio?path=${encodeURIComponent(audioPath)}`, {
    method: request.method,
    headers
  });

  if (!response.ok && response.status !== 206) {
    return json(request, { error: `SONARA audio HTTP ${response.status}` }, response.status || 502);
  }

  const out = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('cache-control', 'private, no-store');
  for (const [name, value] of Object.entries(corsHeaders(request))) out.set(name, value);

  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers: out
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/api/health') {
      if (ctx?.waitUntil) ctx.waitUntil(warmModel(env));
      const cfg = config(env);
      return json(request, {
        status: 'HEALTHY',
        service: 'sonara-production-engine-v8-professional',
        engineConfigured: Boolean(cfg.key && cfg.secret),
        engine: 'SONARA',
        transport: 'direct production API',
        resilience: 'multi-candidate-real-audio-gate-v2',
        inferenceProfile: 'ACE-Step 1.5 LM-thinking professional',
        candidateCount: PROFESSIONAL_CANDIDATE_COUNT,
        automaticQualityRegenerations: MAX_QUALITY_REGENERATIONS,
        outputFormat: PROFESSIONAL_OUTPUT_FORMAT,
        minimumSampleRate: MIN_SAMPLE_RATE,
        minDurationSeconds: 30,
        maxDurationSeconds: 480,
        segmentation: false
      });
    }

    if (path === '/api/engine/generate') {
      if (!internalGenerationAuthorized(request, env)) {
        return json(request, { error: 'SONARA generation requires an authorized billing proxy.' }, 401);
      }
      return generate(request, env, ctx);
    }

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};
