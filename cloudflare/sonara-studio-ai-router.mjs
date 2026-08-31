import runtime from './sonara-quality-gated-router.mjs';
import { analyzeAudioCandidate, rankQualityReports } from './sonara-audio-quality-engine.mjs';
export { SonaraJobState } from './sonara-quality-gated-router.mjs';

const VERSION = 'sonara-studio-ai-v1';
const PRIMARY_MODEL = 'acestep-v15-xl-turbo';
const BASE_MODEL = 'acestep-v15-xl-base';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/studio-ai-v1/';
const STATE_TTL = 6 * 60 * 60;
const SUBMIT_TIMEOUT = 180_000;
const QUERY_TIMEOUT = 20_000;
const AUDIO_TIMEOUT = 120_000;
const MAX_UPLOAD_BYTES = 160 * 1024 * 1024;
const BPM_MIN = 40;
const BPM_MAX = 220;
const STUDIO_JOB_PATH = /^\/api\/studio\/job\/([^/]+)$/;
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const ALLOWED_AUDIO_HOSTS = new Set([
  'sonaraenterprise.com',
  'www.sonaraenterprise.com',
  'api.sonaraenterprise.com',
  'molab.sonaraenterprise.com'
]);
const DEFAULT_STEMS = ['vocals', 'drums', 'bass', 'guitar', 'keys', 'synth', 'strings', 'brass', 'woodwinds', 'percussion', 'pads', 'fx'];

const clean = value => String(value ?? '').trim();
const cleanUrl = value => clean(value).replace(/\/$/, '');
const clamp = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function cors(request) {
  const origin = clean(request.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Studio',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Studio,X-Sonara-Studio-Model',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-studio': VERSION,
      'x-sonara-studio-model': PRIMARY_MODEL,
      ...cors(request)
    }
  });
}

function authHeaders(env, extra = {}) {
  const headers = { ...extra };
  const key = clean(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY);
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers['X-API-Key'] = key;
  }
  return headers;
}

function allowedStudioRequest(request) {
  const origin = clean(request.headers.get('Origin'));
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (!origin && request.method === 'GET') return true;
  return false;
}

function stateRequest(jobId) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(jobId)}`);
}

function studioStateStub(env, jobId) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    if (!ns || typeof ns.idFromName !== 'function' || typeof ns.get !== 'function') return null;
    return ns.get(ns.idFromName(`studio-ai:${jobId}`));
  } catch { return null; }
}

async function saveState(jobId, state, env) {
  const stub = studioStateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state)
      });
      if (response.ok) return;
    } catch {}
  }
  try {
    await caches.default.put(stateRequest(jobId), new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STATE_TTL}` }
    }));
  } catch {}
}

async function loadState(jobId, env) {
  const stub = studioStateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', { method: 'GET' });
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(stateRequest(jobId));
    return response ? await response.json() : null;
  } catch { return null; }
}

function newJobId(operation) {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `studio-${operation}-${Date.now()}-${random[0].toString(36)}${random[1].toString(36)}`;
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean);
    } catch {}
    return text.split(',').map(clean).filter(Boolean);
  }
  return fallback;
}

function normalizeStem(value) {
  const text = clean(value).toLowerCase();
  const aliases = {
    voice: 'vocals', vocal: 'vocals', vocals: 'vocals', vox: 'vocals',
    drum: 'drums', drums: 'drums', percussion: 'percussion',
    bass: 'bass', bassline: 'bass',
    guitar: 'guitar', guitars: 'guitar',
    piano: 'keys', keyboard: 'keys', keyboards: 'keys', keys: 'keys',
    synth: 'synth', synths: 'synth', synthesizer: 'synth', synthesizers: 'synth',
    strings: 'strings', string: 'strings',
    fx: 'fx', effects: 'fx', sfx: 'fx',
    other: 'other'
  };
  return aliases[text] || text.replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || 'instrument';
}

function humanStem(value) {
  const stem = normalizeStem(value);
  const names = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', guitar: 'Guitar', keys: 'Keys', synth: 'Synth', strings: 'Strings', brass: 'Brass', woodwinds: 'Woodwinds', percussion: 'Percussion', pads: 'Pads', fx: 'FX', other: 'Other' };
  return names[stem] || stem.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`);
}

function proxyPathFromUrl(value) {
  const text = clean(value);
  if (!text) return '';
  try {
    const url = new URL(text, PUBLIC_API_ORIGIN);
    if ((url.hostname === 'api.sonaraenterprise.com' || url.hostname === 'molab.sonaraenterprise.com') && (url.pathname === '/api/molab/audio' || url.pathname === '/v1/audio')) {
      return clean(url.searchParams.get('path'));
    }
  } catch {}
  return '';
}

async function fetchAllowedAudio(value) {
  const text = clean(value);
  if (!text) return null;
  let url;
  try { url = new URL(text, PUBLIC_API_ORIGIN); }
  catch { throw new Error('URL audio non valido.'); }
  if (!ALLOWED_AUDIO_HOSTS.has(url.hostname)) throw new Error('Per sicurezza SONARA Studio accetta URL audio solo dai domini SONARA/MoLab. Carica il file per altre sorgenti.');
  const response = await fetch(url.toString(), {
    headers: { Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1' },
    signal: AbortSignal.timeout(AUDIO_TIMEOUT)
  });
  if (!response.ok) throw new Error(`Impossibile leggere l'audio sorgente (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES) throw new Error('Audio troppo grande per SONARA Studio.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('Audio sorgente vuoto.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Audio troppo grande per SONARA Studio.');
  const extension = /mpeg|mp3/i.test(blob.type) ? 'mp3' : /flac/i.test(blob.type) ? 'flac' : /ogg/i.test(blob.type) ? 'ogg' : 'wav';
  return { blob, filename: `sonara-source.${extension}`, type: blob.type || 'audio/wav' };
}

async function readStudioRequest(request) {
  const contentType = clean(request.headers.get('content-type')).toLowerCase();
  const body = {};
  const files = {};
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') {
        body[key] = value;
      } else if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
        if (Number(value.size || 0) > MAX_UPLOAD_BYTES) throw new Error('File audio troppo grande.');
        files[key] = value;
      }
    }
    return { body, files };
  }
  if (contentType.includes('application/json')) {
    Object.assign(body, await request.json());
    return { body, files };
  }
  throw new Error('SONARA Studio richiede JSON o multipart/form-data.');
}

function pickFile(files, names) {
  for (const name of names) if (files[name]) return files[name];
  return null;
}

async function resolveInput(body, files, kind) {
  const isReference = kind === 'reference';
  const file = pickFile(files, isReference
    ? ['reference_audio', 'referenceAudio', 'reference', 'voice_reference']
    : ['src_audio', 'source_audio', 'sourceAudio', 'audio', 'file']);
  if (file) return { blob: file, filename: clean(file.name) || (isReference ? 'reference.wav' : 'source.wav'), type: clean(file.type) || 'audio/wav' };

  const pathValue = clean(isReference
    ? (body.referenceAudioPath || body.reference_audio_path)
    : (body.sourceAudioPath || body.src_audio_path || body.source_audio_path));
  if (pathValue) return { path: pathValue };

  const urlValue = clean(isReference
    ? (body.referenceAudioUrl || body.reference_audio_url)
    : (body.sourceAudioUrl || body.srcAudioUrl || body.audioUrl || body.source_audio_url));
  if (!urlValue) return null;
  const proxyPath = proxyPathFromUrl(urlValue);
  if (proxyPath) return { path: proxyPath };
  return fetchAllowedAudio(urlValue);
}

function commonPayload(body = {}, model = PRIMARY_MODEL) {
  const bpm = Math.round(clamp(body.bpm ?? body.requestedBpm, 124, BPM_MIN, BPM_MAX));
  const duration = clamp(body.durationSec ?? body.duration ?? body.audio_duration, 60, 5, 600);
  const isBase = /base/i.test(model);
  return {
    model,
    prompt: clean(body.prompt || body.caption || body.description).slice(0, 9000),
    lyrics: clean(body.lyrics).slice(0, 12000),
    bpm,
    key_scale: clean(body.key || body.key_scale || body.keySignature),
    time_signature: clean(body.timeSignature || body.time_signature || '4'),
    vocal_language: clean(body.vocalLanguage || body.vocal_language || 'en').slice(0, 12),
    audio_duration: duration,
    audio_format: 'wav',
    inference_steps: isBase ? 50 : 8,
    guidance_scale: isBase ? 7.0 : 1.0,
    batch_size: 1,
    thinking: false,
    use_format: false,
    use_cot_metas: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: false,
    constrained_decoding_debug: false,
    allow_lm_batch: false,
    use_random_seed: true,
    seed: -1
  };
}

function appendPayload(form, payload) {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === '') continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
}

async function submitTask(baseUrl, env, payload, sourceInput = null, referenceInput = null) {
  let response;
  if ((sourceInput?.blob || referenceInput?.blob)) {
    const form = new FormData();
    appendPayload(form, payload);
    if (sourceInput?.path) form.append('src_audio_path', sourceInput.path);
    if (referenceInput?.path) form.append('reference_audio_path', referenceInput.path);
    if (sourceInput?.blob) form.append('src_audio', sourceInput.blob, sourceInput.filename || 'source.wav');
    if (referenceInput?.blob) form.append('reference_audio', referenceInput.blob, referenceInput.filename || 'reference.wav');
    response = await fetch(`${baseUrl}/release_task`, {
      method: 'POST',
      headers: authHeaders(env, { Accept: 'application/json' }),
      body: form,
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
    });
  } else {
    const body = { ...payload };
    if (sourceInput?.path) body.src_audio_path = sourceInput.path;
    if (referenceInput?.path) body.reference_audio_path = referenceInput.path;
    response = await fetch(`${baseUrl}/release_task`, {
      method: 'POST',
      headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
    });
  }

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab Studio ha restituito una risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(clean(data?.detail || data?.error?.message || data?.error || data?.message || `MoLab Studio HTTP ${response.status}`));
  }
  const taskId = clean(data?.data?.task_id || data?.task_id);
  if (!taskId) throw new Error('MoLab Studio non ha restituito task_id.');
  return taskId;
}

async function queryTasks(baseUrl, env, taskIds) {
  const response = await fetch(`${baseUrl}/query_result`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: taskIds }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab Studio query non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(clean(data?.error?.message || data?.error || data?.message || `MoLab Studio query HTTP ${response.status}`));
  }
  return Array.isArray(data?.data) ? data.data : [];
}

function taskStatus(task) {
  const raw = task?.status;
  if (typeof raw === 'number') return raw === 1 ? 1 : raw === 0 ? 0 : -1;
  const text = clean(raw).toLowerCase();
  if (['1', 'success', 'succeeded', 'completed', 'complete', 'done', 'finished'].includes(text)) return 1;
  if (['0', 'pending', 'queued', 'running', 'processing', 'in_progress', 'in-progress'].includes(text) || !text) return 0;
  return -1;
}

function resultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function refsFrom(task, baseUrl) {
  const refs = [];
  const seen = new Set();
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      let path = '';
      try { path = new URL(value, `${baseUrl}/`).searchParams.get('path') || ''; } catch {}
      if (!path && value.startsWith('/') && !value.startsWith('/v1/audio')) path = value;
      if (path && !seen.has(path)) {
        seen.add(path);
        refs.push(path);
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      for (const key of ['file', 'url', 'audio_path', 'audio_file', 'path', 'output', 'outputs', 'audio', 'audios', 'wave']) {
        if (key in value) visit(value[key]);
      }
    }
  };
  resultItems(task?.result).forEach(visit);
  return refs;
}

function progressFromTask(task) {
  const first = resultItems(task?.result)[0] || {};
  const raw = Number(first?.progress ?? task?.progress ?? 0);
  return clamp(raw <= 1 ? raw * 100 : raw, 0, 0, 100);
}

function publicAudioUrl(path) {
  return `${PUBLIC_API_ORIGIN}/api/molab/audio?path=${encodeURIComponent(path)}`;
}

function directAudioFetch(baseUrl, env) {
  return async (input, init = {}) => {
    try {
      const inputUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(inputUrl, PUBLIC_API_ORIGIN);
      if ((url.hostname === 'api.sonaraenterprise.com' || url.hostname === 'molab.sonaraenterprise.com') && (url.pathname === '/api/molab/audio' || url.pathname === '/v1/audio')) {
        const path = clean(url.searchParams.get('path'));
        if (path) {
          const headers = new Headers(init.headers || {});
          for (const [key, value] of Object.entries(authHeaders(env))) if (!headers.has(key)) headers.set(key, value);
          return fetch(`${baseUrl}/v1/audio?path=${encodeURIComponent(path)}`, { ...init, headers });
        }
      }
    } catch {}
    return fetch(input, init);
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.from(items || []);
  const results = new Array(source.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(Number(limit) || 1, source.length || 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= source.length) return;
      results[index] = await mapper(source[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function padWavInputToDuration(input, targetDurationSec) {
  if (!input?.blob) return input;
  const targetSeconds = Number(targetDurationSec);
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return input;
  const buffer = await input.blob.arrayBuffer();
  if (buffer.byteLength < 44) return input;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') return input;
  let offset = 12, sampleRate = 0, blockAlign = 0, dataHeader = -1, dataOffset = -1, dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = ascii(offset, 4), size = view.getUint32(offset + 4, true), payload = offset + 8;
    if (id === 'fmt ' && payload + 16 <= view.byteLength) {
      sampleRate = view.getUint32(payload + 4, true); blockAlign = view.getUint16(payload + 12, true);
    }
    if (id === 'data') { dataHeader = offset; dataOffset = payload; dataSize = Math.max(0, Math.min(size, view.byteLength - payload)); break; }
    offset = payload + size + (size % 2);
  }
  if (!sampleRate || !blockAlign || dataHeader < 0 || dataOffset < 0) return input;
  const currentFrames = Math.floor(dataSize / blockAlign);
  const targetFrames = Math.ceil(targetSeconds * sampleRate);
  if (targetFrames <= currentFrames + Math.ceil(sampleRate * 0.05)) return input;
  const targetDataSize = targetFrames * blockAlign;
  const outputSize = dataOffset + targetDataSize;
  if (outputSize > MAX_UPLOAD_BYTES) throw new Error('Audio Extend troppo grande dopo il padding di continuazione.');
  const output = new Uint8Array(outputSize);
  output.set(bytes.slice(0, dataOffset + dataSize), 0);
  const out = new DataView(output.buffer);
  out.setUint32(4, output.byteLength - 8, true);
  out.setUint32(dataHeader + 4, targetDataSize, true);
  return { ...input, blob: new Blob([output], { type: 'audio/wav' }), filename: 'sonara-extend-source.wav', type: 'audio/wav' };
}

async function createStudioJob(request, env, operation) {
  if (!allowedStudioRequest(request)) return json(request, { error: 'Origin non autorizzata per SONARA Studio.' }, 403);
  const baseUrl = molabUrl(env);
  if (!baseUrl) return json(request, { error: 'MoLab non configurato.' }, 503);

  try {
    const { body, files } = await readStudioRequest(request);
    const sourceInput = await resolveInput(body, files, 'source');
    const referenceInput = await resolveInput(body, files, 'reference');
    const bpm = Math.round(clamp(body.bpm ?? body.requestedBpm, 124, BPM_MIN, BPM_MAX));
    const key = clean(body.key || body.key_scale || body.keySignature);
    const tasks = [];

    if (operation === 'repaint') {
      if (!sourceInput) throw new Error('Seleziona il brano sorgente per rigenerare una sezione.');
      const start = clamp(body.start ?? body.repainting_start, 0, 0, 600);
      const end = clamp(body.end ?? body.repainting_end, Math.max(start + 8, 20), start + 0.5, 600);
      const payload = {
        ...commonPayload(body, PRIMARY_MODEL),
        task_type: 'repaint',
        repainting_start: start,
        repainting_end: end,
        repaint_mode: clean(body.repaintMode || body.repaint_mode || 'balanced'),
        repaint_strength: clamp(body.repaintStrength ?? body.repaint_strength, 0.52, 0, 1),
        repaint_latent_crossfade_frames: Math.round(clamp(body.latentCrossfadeFrames, 12, 0, 100)),
        repaint_wav_crossfade_sec: clamp(body.crossfadeSec, 0.18, 0, 3),
        instruction: `Repaint only ${round(start, 2)}-${round(end, 2)} seconds. Preserve everything outside the selected region exactly. Preserve BPM ${bpm}${key ? `, key ${key}` : ''}, singer identity, arrangement continuity, loudness and ambience. ${clean(body.prompt || body.instruction || 'Improve the selected passage musically and technically.')}`
      };
      tasks.push({ taskId: await submitTask(baseUrl, env, payload, sourceInput, referenceInput), label: 'Repaint', kind: 'master' });
    } else if (operation === 'cover') {
      if (!sourceInput) throw new Error('Seleziona il brano sorgente per Remix/Cover.');
      const payload = {
        ...commonPayload(body, PRIMARY_MODEL),
        task_type: 'cover',
        audio_cover_strength: clamp(body.influence ?? body.audio_cover_strength, 0.72, 0, 1),
        cover_noise_strength: clamp(body.coverNoiseStrength ?? body.cover_noise_strength, 0.15, 0, 1),
        instruction: `Transform the source while preserving musical coherence. Lock requested BPM ${bpm}${key ? ` and key ${key}` : ''}. ${clean(body.prompt || body.instruction || 'Create a polished alternate production.')}`
      };
      tasks.push({ taskId: await submitTask(baseUrl, env, payload, sourceInput, referenceInput), label: 'Remix / Cover', kind: 'master' });
    } else if (operation === 'reference' || operation === 'persona' || operation === 'voice') {
      const ref = referenceInput || sourceInput;
      if (!ref) throw new Error('Carica un audio di riferimento.');
      const voiceIdentity = clean(body.voiceIdentity || body.voice_identity || body.voiceProfile);
      const persona = clean(body.persona || body.stylePersona || body.personaDescription);
      const identityInstruction = operation === 'voice'
        ? `VOICE IDENTITY LOCK: ${voiceIdentity || 'preserve the reference singer timbre, register, formants, pronunciation, accent, vibrato behavior, breath pattern and expressive character consistently from start to finish.'}`
        : operation === 'persona'
          ? `PERSONA / STYLE DNA: ${persona || 'learn the reference production language, groove, instrumentation, energy, density and mix character without copying the composition.'}`
          : 'REFERENCE AUDIO: use the reference only as style/performance guidance; create an original composition.';
      const payload = {
        ...commonPayload(body, PRIMARY_MODEL),
        task_type: 'text2music',
        audio_cover_strength: clamp(body.influence ?? body.referenceInfluence, 0.55, 0, 1),
        instruction: `${identityInstruction} Keep BPM ${bpm}${key ? `, key ${key}` : ''}. ${clean(body.prompt || body.instruction || 'Create an original studio-quality song from this reference identity.')}`
      };
      tasks.push({ taskId: await submitTask(baseUrl, env, payload, null, ref), label: operation === 'voice' ? 'Voice Identity' : operation === 'persona' ? 'Persona' : 'Reference', kind: 'master' });
    } else if (operation === 'stems') {
      if (!sourceInput) throw new Error('Seleziona il brano sorgente da separare.');
      const requested = parseList(body.stems, DEFAULT_STEMS).map(normalizeStem).filter(Boolean).slice(0, 12);
      const stems = [...new Set(requested.length ? requested : DEFAULT_STEMS)];
      for (const stem of stems) {
        const label = humanStem(stem);
        const payload = {
          ...commonPayload(body, BASE_MODEL),
          task_type: 'extract',
          prompt: `${label} stem`,
          instruction: `Extract only the ${label} track from the source mix. Preserve exact timing, phase alignment, duration and natural transients. Minimize bleed and artifacts. Return a clean isolated ${label} stem.`
        };
        const taskId = await submitTask(baseUrl, env, payload, sourceInput, null);
        tasks.push({ taskId, label, kind: 'stem', stem });
      }
    } else if (operation === 'regenerate-stem') {
      if (!sourceInput) throw new Error('Seleziona il mix o lo stem di contesto.');
      const stem = normalizeStem(body.stem || body.track || 'instrument');
      const label = humanStem(stem);
      const payload = {
        ...commonPayload(body, BASE_MODEL),
        task_type: 'lego',
        prompt: `${label}: ${clean(body.prompt || body.instruction || `Create a better ${label} performance.`)}`,
        repainting_start: clamp(body.start ?? body.repainting_start, 0, 0, 600),
        repainting_end: body.end ?? body.repainting_end ? clamp(body.end ?? body.repainting_end, 600, 0.5, 600) : -1,
        instruction: `Generate only a new ${label} track in context with the source audio. Preserve exact BPM ${bpm}${key ? `, key ${key}` : ''}, bar grid, arrangement and harmonic timing. ${clean(body.prompt || body.instruction || `Create a human, expressive, mix-ready ${label} performance.`)}`
      };
      tasks.push({ taskId: await submitTask(baseUrl, env, payload, sourceInput, referenceInput), label: `${label} Regenerated`, kind: 'stem', stem });
    } else if (operation === 'complete') {
      if (!sourceInput) throw new Error('Seleziona il materiale audio da completare.');
      const targetDuration = clamp(body.durationSec ?? body.duration ?? body.audio_duration, 60, 5, 600);
      const continuationInput = await padWavInputToDuration(sourceInput, targetDuration);
      const classes = parseList(body.trackClasses || body.tracks || body.stems, ['drums', 'bass', 'keys']).map(normalizeStem).slice(0, 8);
      const labels = classes.map(humanStem);
      const payload = {
        ...commonPayload({ ...body, durationSec: targetDuration }, BASE_MODEL),
        task_type: 'complete',
        prompt: clean(body.prompt || body.instruction || `Complete the arrangement with ${labels.join(', ')}.`),
        instruction: `Continue the source through the full ${round(targetDuration, 2)} seconds and fill the silent tail musically with ${labels.join(', ')}. Preserve exact BPM ${bpm}${key ? ` and key ${key}` : ''}; match the existing groove, bar grid, harmony, ambience and production quality. ${clean(body.prompt || body.instruction)}`
      };
      tasks.push({ taskId: await submitTask(baseUrl, env, payload, continuationInput, referenceInput), label: 'Arrangement Complete', kind: 'master' });
    } else if (operation === 'repair') {
      if (!sourceInput) throw new Error('Seleziona il master da riparare.');
      const issues = parseList(body.issues, ['BPM drift', 'artifacts', 'mix balance']);
      const payload = {
        ...commonPayload(body, PRIMARY_MODEL),
        task_type: 'cover',
        audio_cover_strength: clamp(body.preserveStrength, 0.86, 0.5, 1),
        cover_noise_strength: 0.08,
        instruction: `QUALITY REPAIR: preserve composition, lyrics, singer identity and arrangement. Correct these issues: ${issues.join(', ')}. Hard-lock BPM ${bpm}${key ? ` and key ${key}` : ''}. Remove clipping, metallic/phasey vocal artifacts, plastic transients, silence defects and malformed endings. Deliver a clean release-ready master.`
      };
      tasks.push({ taskId: await submitTask(baseUrl, env, payload, sourceInput, null), label: 'Quality Repair', kind: 'master' });
    } else {
      throw new Error(`Operazione Studio non supportata: ${operation}`);
    }

    const jobId = newJobId(operation);
    const state = {
      jobId,
      operation,
      tasks,
      requested: { bpm, key, prompt: clean(body.prompt || body.instruction).slice(0, 1200) },
      createdAt: Date.now(),
      model: tasks.some(task => task.kind === 'stem') || ['stems', 'regenerate-stem', 'complete'].includes(operation) ? BASE_MODEL : PRIMARY_MODEL
    };
    await saveState(jobId, state, env);
    return json(request, {
      jobId,
      status: 'QUEUED',
      operation,
      taskCount: tasks.length,
      model: state.model,
      qualityJudge: 'sonara-audio-quality-engine-v1',
      pollUrl: `${PUBLIC_API_ORIGIN}/api/studio/job/${encodeURIComponent(jobId)}`
    }, 202);
  } catch (error) {
    return json(request, { status: 'FAILED', error: error instanceof Error ? error.message : String(error), operation }, 400);
  }
}

async function studioJob(request, env, jobId) {
  if (!allowedStudioRequest(request)) return json(request, { error: 'Origin non autorizzata.' }, 403);
  const state = await loadState(jobId, env);
  if (!state) return json(request, { status: 'NOT_FOUND', error: 'Job SONARA Studio non trovato o scaduto.' }, 404);
  if (state.completedResult) return json(request, state.completedResult);

  const baseUrl = molabUrl(env);
  if (!baseUrl) return json(request, { status: 'FAILED', error: 'MoLab non configurato.' }, 503);

  try {
    const taskIds = state.tasks.map(task => task.taskId);
    const rows = await queryTasks(baseUrl, env, taskIds);
    const byId = new Map(rows.map(row => [clean(row?.task_id || row?.id), row]));
    const taskReports = state.tasks.map((task, index) => {
      const row = byId.get(task.taskId) || rows[index] || {};
      return { ...task, row, statusCode: taskStatus(row), progress: progressFromTask(row) };
    });
    const failed = taskReports.find(item => item.statusCode < 0);
    if (failed) {
      const message = clean(failed.row?.error?.message || failed.row?.error || failed.row?.message || `${failed.label} non riuscito.`);
      return json(request, {
        jobId,
        operation: state.operation,
        status: 'FAILED',
        progress: round(taskReports.reduce((sum, item) => sum + item.progress, 0) / Math.max(1, taskReports.length), 1),
        error: message,
        failedTask: failed.label,
        tasks: taskReports.map(item => ({ label: item.label, status: item.statusCode, progress: item.progress }))
      }, 500);
    }

    const complete = taskReports.every(item => item.statusCode === 1);
    const progress = round(taskReports.reduce((sum, item) => sum + (item.statusCode === 1 ? 100 : item.progress), 0) / Math.max(1, taskReports.length), 1);
    if (!complete) {
      return json(request, {
        jobId,
        operation: state.operation,
        status: 'PROCESSING',
        progress,
        model: state.model,
        tasks: taskReports.map(item => ({ label: item.label, status: item.statusCode === 1 ? 'COMPLETED' : 'PROCESSING', progress: item.statusCode === 1 ? 100 : item.progress }))
      });
    }

    const outputs = [];
    for (const item of taskReports) {
      const refs = refsFrom(item.row, baseUrl);
      refs.forEach((path, index) => outputs.push({
        id: `${item.taskId}-${index}`,
        label: refs.length > 1 ? `${item.label} ${index + 1}` : item.label,
        kind: item.kind,
        stem: item.stem || null,
        path,
        audioUrl: publicAudioUrl(path),
        model: state.model
      }));
    }
    if (!outputs.length) {
      return json(request, { jobId, operation: state.operation, status: 'FAILED', error: 'MoLab ha completato il job ma non ha restituito file audio.' }, 502);
    }

    const qualityFetch = directAudioFetch(baseUrl, env);
    const qualityReports = await mapWithConcurrency(outputs.slice(0, 12), 1, async (output, index) => {
      try {
        const verifyMusicalGrid = !['stems', 'regenerate-stem'].includes(state.operation);
        const report = await analyzeAudioCandidate(output.audioUrl, {
          bpm: verifyMusicalGrid ? state.requested?.bpm : null,
          key: verifyMusicalGrid ? state.requested?.key : null
        }, qualityFetch);
        return { ...report, outputIndex: index, label: output.label, audioUrl: output.audioUrl };
      } catch (error) {
        return {
          analyzer: 'sonara-audio-quality-engine-v1',
          outputIndex: index,
          label: output.label,
          audioUrl: output.audioUrl,
          measuredFromRealWav: false,
          qualityScore: 0,
          qualityGatePassed: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    const ranked = rankQualityReports(qualityReports);
    const reportByIndex = new Map(qualityReports.map(report => [report.outputIndex, report]));
    const enrichedOutputs = outputs.map((output, index) => ({ ...output, quality: reportByIndex.get(index) || null }));
    const result = {
      jobId,
      operation: state.operation,
      status: 'COMPLETED',
      progress: 100,
      model: state.model,
      completedAt: Date.now(),
      outputs: enrichedOutputs,
      qualityJudge: {
        engine: 'sonara-audio-quality-engine-v1',
        measuredFromRealWav: qualityReports.some(report => report.measuredFromRealWav === true),
        bestScore: ranked[0]?.qualityScore ?? null,
        bestDetectedBpm: ranked[0]?.detectedBpm ?? null,
        bpmVerified: ranked[0]?.bpmPassed ?? null,
        keyVerified: ranked[0]?.keyComparable ? ranked[0]?.keyPassed === true : null,
        reports: ranked,
        repairRecommended: state.operation !== 'stems' && (Number(ranked[0]?.qualityScore || 0) < 70 || ranked[0]?.bpmPassed === false)
      }
    };
    state.completedResult = result;
    await saveState(jobId, state, env);
    return json(request, result);
  } catch (error) {
    return json(request, { jobId, operation: state.operation, status: 'FAILED', error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

function capabilities() {
  return {
    ready: true,
    profile: VERSION,
    provider: 'molab',
    primaryModel: PRIMARY_MODEL,
    editModel: PRIMARY_MODEL,
    stemModel: BASE_MODEL,
    qualityJudge: 'sonara-audio-quality-engine-v1',
    operations: {
      sectionRepaint: true,
      remixCover: true,
      referenceAudio: true,
      personaStyleDna: true,
      voiceIdentityReference: true,
      stemExtraction: true,
      stemRegeneration: true,
      arrangementCompletion: true,
      qualityRepair: true,
      multitrackStudio: true,
      midiTimeline: true
    },
    notes: {
      turboOperations: ['text2music', 'cover', 'repaint'],
      baseOperations: ['extract', 'lego', 'complete'],
      baseModelMayInitializeOnFirstUse: true
    }
  };
}

const STUDIO_CSS = String.raw`
#sonara-studio-ai-launch{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:1px solid rgba(255,255,255,.16);background:#fff;color:#05070a;border-radius:14px;padding:10px 14px;font:800 12px/1 system-ui;box-shadow:0 18px 70px rgba(0,0,0,.48);cursor:pointer;letter-spacing:.02em}
#sonara-studio-ai-launch:hover{transform:translateY(-1px)}
#sonara-studio-ai-overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.72);backdrop-filter:blur(14px);display:none;align-items:stretch;justify-content:flex-end}
#sonara-studio-ai-overlay.sonara-open{display:flex}
#sonara-studio-ai-panel{width:min(560px,100vw);height:100%;overflow:auto;background:#07090d;color:#eef2f7;border-left:1px solid rgba(255,255,255,.08);box-shadow:-30px 0 90px rgba(0,0,0,.48);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.sonara-ai-head{position:sticky;top:0;z-index:3;background:rgba(7,9,13,.96);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.07);padding:16px 18px;display:flex;gap:12px;align-items:center}
.sonara-ai-title{font-weight:900;font-size:14px;letter-spacing:-.01em}.sonara-ai-sub{font-size:10px;color:#6f7b8d;margin-top:3px}.sonara-ai-close{margin-left:auto;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#c8d0dc;border-radius:10px;width:34px;height:34px;cursor:pointer}
.sonara-ai-body{padding:16px 18px 90px}.sonara-ai-source{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);border-radius:15px;padding:13px;margin-bottom:14px}.sonara-ai-source audio{width:100%;height:36px;margin-top:9px}
.sonara-ai-label{display:block;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#687385;margin:12px 0 6px}.sonara-ai-input,.sonara-ai-select,.sonara-ai-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.09);background:#0c1017;color:#eef2f7;border-radius:10px;padding:10px 11px;font:600 12px/1.4 system-ui;outline:none}.sonara-ai-textarea{min-height:78px;resize:vertical}.sonara-ai-input:focus,.sonara-ai-select:focus,.sonara-ai-textarea:focus{border-color:rgba(167,139,250,.55)}
.sonara-ai-tabs{display:flex;gap:5px;overflow:auto;margin-bottom:12px}.sonara-ai-tab{border:1px solid rgba(255,255,255,.07);background:transparent;color:#8792a3;border-radius:9px;padding:8px 10px;font:800 10px/1 system-ui;white-space:nowrap;cursor:pointer}.sonara-ai-tab.sonara-active{background:#fff;color:#05070a;border-color:#fff}.sonara-ai-pane{display:none}.sonara-ai-pane.sonara-active{display:block}
.sonara-ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sonara-ai-btn{width:100%;border:1px solid rgba(167,139,250,.26);background:rgba(139,92,246,.13);color:#ddd6fe;border-radius:11px;padding:11px 12px;font:900 11px/1.2 system-ui;cursor:pointer}.sonara-ai-btn:hover{background:rgba(139,92,246,.2)}.sonara-ai-btn.sonara-primary{background:#fff;color:#05070a;border-color:#fff}.sonara-ai-btn:disabled{opacity:.45;cursor:not-allowed}.sonara-ai-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sonara-ai-check{display:flex;gap:7px;align-items:center;border:1px solid rgba(255,255,255,.06);padding:8px 9px;border-radius:9px;color:#aab4c2;font-size:11px}
#sonara-ai-status{margin:13px 0;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);padding:10px 11px;color:#9ba7b7;font-size:11px;display:none}#sonara-ai-status.sonara-show{display:block}.sonara-ai-output{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:11px;margin-top:9px;background:rgba(255,255,255,.02)}.sonara-ai-output-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}.sonara-ai-output-name{font-weight:900;font-size:11px}.sonara-ai-score{margin-left:auto;font:900 10px/1 monospace;color:#86efac}.sonara-ai-output audio{width:100%;height:34px}.sonara-ai-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.sonara-ai-mini{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#b9c3d1;border-radius:8px;padding:7px;font:800 9px/1 system-ui;cursor:pointer}.sonara-ai-note{font-size:10px;line-height:1.5;color:#687385;margin-top:8px}.sonara-ai-badge{display:inline-flex;border:1px solid rgba(52,211,153,.18);background:rgba(52,211,153,.07);color:#6ee7b7;border-radius:999px;padding:4px 7px;font:900 8px/1 system-ui;margin-left:7px}
@media(max-width:620px){#sonara-studio-ai-launch{right:10px;bottom:10px}.sonara-ai-grid{grid-template-columns:1fr}.sonara-ai-actions{grid-template-columns:1fr}.sonara-ai-checks{grid-template-columns:1fr}}
`;

const STUDIO_UI = String.raw`(() => {
  if (window.__sonaraStudioAiV1) return;
  window.__sonaraStudioAiV1 = true;
  const API = 'https://api.sonaraenterprise.com';
  const STORE_SOURCE = 'sonara.studio.sourceAudioUrl';
  const STORE_VOICE = 'sonara.studio.voiceProfile';
  const STORE_PERSONA = 'sonara.studio.personaProfile';
  let sourceFile = null;
  let referenceFile = null;
  let sourceUrl = localStorage.getItem(STORE_SOURCE) || '';
  let currentJob = '';
  let pollToken = 0;

  const launch = document.createElement('button');
  launch.id = 'sonara-studio-ai-launch';
  launch.type = 'button';
  launch.textContent = '✦ Studio AI';
  document.body.appendChild(launch);

  const overlay = document.createElement('div');
  overlay.id = 'sonara-studio-ai-overlay';
  overlay.innerHTML = "<section id='sonara-studio-ai-panel'><header class='sonara-ai-head'><div><div class='sonara-ai-title'>SONARA Studio AI <span class='sonara-ai-badge'>REAL AUDIO</span></div><div class='sonara-ai-sub'>Repaint · Stems · Voice · Persona · Reference · Quality Judge</div></div><button class='sonara-ai-close' type='button' aria-label='Chiudi'>×</button></header><div class='sonara-ai-body'><div class='sonara-ai-source'><label class='sonara-ai-label'>Sorgente corrente</label><input id='sonara-ai-source-url' class='sonara-ai-input' placeholder='URL del brano SONARA' spellcheck='false'><label class='sonara-ai-label'>Oppure carica audio</label><input id='sonara-ai-source-file' class='sonara-ai-input' type='file' accept='audio/*'><audio id='sonara-ai-source-player' controls preload='metadata'></audio></div><nav class='sonara-ai-tabs'><button class='sonara-ai-tab sonara-active' data-tab='edit'>Edit</button><button class='sonara-ai-tab' data-tab='stems'>Stems</button><button class='sonara-ai-tab' data-tab='identity'>Voice / Persona</button><button class='sonara-ai-tab' data-tab='reference'>Reference</button><button class='sonara-ai-tab' data-tab='quality'>Quality</button></nav><div class='sonara-ai-pane sonara-active' data-pane='edit'><div class='sonara-ai-grid'><div><label class='sonara-ai-label'>Inizio sec.</label><input id='sonara-ai-start' class='sonara-ai-input' type='number' min='0' step='.1' value='10'></div><div><label class='sonara-ai-label'>Fine sec.</label><input id='sonara-ai-end' class='sonara-ai-input' type='number' min='.5' step='.1' value='20'></div></div><label class='sonara-ai-label'>Cosa deve cambiare</label><textarea id='sonara-ai-edit-prompt' class='sonara-ai-textarea' placeholder='Esempio: sostituisci questa parte con un assolo di chitarra più emotivo, stessa voce e stesso groove'></textarea><div class='sonara-ai-grid' style='margin-top:9px'><button class='sonara-ai-btn sonara-primary' data-action='repaint'>Rigenera sezione</button><button class='sonara-ai-btn' data-action='complete'>Completa arrangiamento</button></div></div><div class='sonara-ai-pane' data-pane='stems'><label class='sonara-ai-label'>Stem da estrarre</label><div class='sonara-ai-checks' id='sonara-ai-stem-checks'></div><button class='sonara-ai-btn sonara-primary' style='margin-top:10px' data-action='stems'>Separa stems</button><label class='sonara-ai-label'>Rigenera singolo stem</label><select id='sonara-ai-stem-select' class='sonara-ai-select'></select><textarea id='sonara-ai-stem-prompt' class='sonara-ai-textarea' style='margin-top:7px' placeholder='Esempio: basso analogico più profondo, umano, stesso BPM e stessa armonia'></textarea><button class='sonara-ai-btn' style='margin-top:9px' data-action='regenerate-stem'>Rigenera stem</button><div class='sonara-ai-note'>Extract / Lego / Complete usano il modello ACE-Step XL Base sullo stesso MoLab. Il primo utilizzo può inizializzare il modello Base.</div></div><div class='sonara-ai-pane' data-pane='identity'><label class='sonara-ai-label'>Audio voce / stile di riferimento</label><input id='sonara-ai-reference-file' class='sonara-ai-input' type='file' accept='audio/*'><label class='sonara-ai-label'>Voice Identity</label><textarea id='sonara-ai-voice' class='sonara-ai-textarea' placeholder='Timbro, registro, accento, vibrato, intensità, pronuncia...'></textarea><div class='sonara-ai-grid' style='margin-top:8px'><button class='sonara-ai-btn' data-save='voice'>Salva Voice</button><button class='sonara-ai-btn sonara-primary' data-action='voice'>Genera con Voice</button></div><label class='sonara-ai-label'>Persona / Style DNA</label><textarea id='sonara-ai-persona' class='sonara-ai-textarea' placeholder='Groove, strumenti, energia, produzione, spazio, carattere...'></textarea><div class='sonara-ai-grid' style='margin-top:8px'><button class='sonara-ai-btn' data-save='persona'>Salva Persona</button><button class='sonara-ai-btn sonara-primary' data-action='persona'>Genera con Persona</button></div></div><div class='sonara-ai-pane' data-pane='reference'><label class='sonara-ai-label'>Reference Audio</label><input id='sonara-ai-reference-file-2' class='sonara-ai-input' type='file' accept='audio/*'><label class='sonara-ai-label'>Influenza <span id='sonara-ai-influence-value'>55%</span></label><input id='sonara-ai-influence' style='width:100%' type='range' min='0' max='100' value='55'><label class='sonara-ai-label'>Nuova creazione</label><textarea id='sonara-ai-reference-prompt' class='sonara-ai-textarea' placeholder='Descrivi il nuovo brano: la reference guida il carattere, non copia la composizione'></textarea><button class='sonara-ai-btn sonara-primary' style='margin-top:9px' data-action='reference'>Genera da Reference</button><button class='sonara-ai-btn' style='margin-top:7px' data-action='cover'>Remix / Cover sorgente</button></div><div class='sonara-ai-pane' data-pane='quality'><div class='sonara-ai-note'>Il Quality Judge misura il WAV reale: BPM, clipping, silenzi, RMS, dinamica, tonalità approssimata e score. Se il master non passa, puoi avviare la riparazione mantenendo composizione e identità.</div><label class='sonara-ai-label'>Problemi da correggere</label><textarea id='sonara-ai-repair-issues' class='sonara-ai-textarea'>BPM drift, clipping, vocal artifacts, plastic transients, mix balance, malformed ending</textarea><button class='sonara-ai-btn sonara-primary' style='margin-top:9px' data-action='repair'>Auto-fix master</button></div><div id='sonara-ai-status'></div><div id='sonara-ai-results'></div></div></section>";
  document.body.appendChild(overlay);

  const q = selector => overlay.querySelector(selector);
  const sourceInput = q('#sonara-ai-source-url');
  const sourcePlayer = q('#sonara-ai-source-player');
  const sourceFileInput = q('#sonara-ai-source-file');
  const referenceInputA = q('#sonara-ai-reference-file');
  const referenceInputB = q('#sonara-ai-reference-file-2');
  const statusBox = q('#sonara-ai-status');
  const results = q('#sonara-ai-results');
  const stems = ['vocals','drums','bass','guitar','keys','synth','strings','brass','woodwinds','percussion','pads','fx'];
  const stemChecks = q('#sonara-ai-stem-checks');
  const stemSelect = q('#sonara-ai-stem-select');
  stems.forEach(function(stem){
    const label = document.createElement('label');
    label.className = 'sonara-ai-check';
    label.innerHTML = "<input type='checkbox' value='" + stem + "' checked>" + stem.charAt(0).toUpperCase() + stem.slice(1);
    stemChecks.appendChild(label);
    const option = document.createElement('option'); option.value = stem; option.textContent = stem.charAt(0).toUpperCase() + stem.slice(1); stemSelect.appendChild(option);
  });

  function syncSource(value){
    sourceUrl = value || '';
    sourceInput.value = sourceUrl;
    sourcePlayer.src = sourceUrl;
    if (sourceUrl) localStorage.setItem(STORE_SOURCE, sourceUrl);
  }
  syncSource(sourceUrl);

  launch.addEventListener('click', function(){ overlay.classList.add('sonara-open'); });
  q('.sonara-ai-close').addEventListener('click', function(){ overlay.classList.remove('sonara-open'); });
  overlay.addEventListener('click', function(event){ if (event.target === overlay) overlay.classList.remove('sonara-open'); });
  sourceInput.addEventListener('change', function(){ sourceFile = null; syncSource(sourceInput.value.trim()); });
  sourceFileInput.addEventListener('change', function(){ sourceFile = sourceFileInput.files && sourceFileInput.files[0] || null; if (sourceFile) sourcePlayer.src = URL.createObjectURL(sourceFile); });
  referenceInputA.addEventListener('change', function(){ referenceFile = referenceInputA.files && referenceInputA.files[0] || null; });
  referenceInputB.addEventListener('change', function(){ referenceFile = referenceInputB.files && referenceInputB.files[0] || null; });
  q('#sonara-ai-influence').addEventListener('input', function(event){ q('#sonara-ai-influence-value').textContent = event.target.value + '%'; });
  q('#sonara-ai-voice').value = localStorage.getItem(STORE_VOICE) || '';
  q('#sonara-ai-persona').value = localStorage.getItem(STORE_PERSONA) || '';
  overlay.querySelectorAll('[data-save]').forEach(function(button){ button.addEventListener('click', function(){ const type = button.getAttribute('data-save'); const value = type === 'voice' ? q('#sonara-ai-voice').value : q('#sonara-ai-persona').value; localStorage.setItem(type === 'voice' ? STORE_VOICE : STORE_PERSONA, value); setStatus((type === 'voice' ? 'Voice Identity' : 'Persona') + ' salvata nel profilo locale.', false); }); });
  overlay.querySelectorAll('.sonara-ai-tab').forEach(function(tab){ tab.addEventListener('click', function(){ overlay.querySelectorAll('.sonara-ai-tab').forEach(function(item){ item.classList.remove('sonara-active'); }); overlay.querySelectorAll('.sonara-ai-pane').forEach(function(item){ item.classList.remove('sonara-active'); }); tab.classList.add('sonara-active'); q("[data-pane='" + tab.getAttribute('data-tab') + "']").classList.add('sonara-active'); }); });

  function setStatus(text, busy){
    statusBox.classList.add('sonara-show');
    statusBox.textContent = (busy ? '● ' : '') + text;
  }
  function bpmValue(){ const stored = Number(localStorage.getItem('sonara.preferredBpm') || 124); return Math.max(40, Math.min(220, Math.round(stored || 124))); }
  function keyValue(){ return 'A Minor'; }
  function formFor(action){
    const form = new FormData();
    if (sourceFile) form.append('src_audio', sourceFile, sourceFile.name || 'source.wav'); else if (sourceUrl) form.append('sourceAudioUrl', sourceUrl);
    if (referenceFile) form.append('reference_audio', referenceFile, referenceFile.name || 'reference.wav');
    form.append('bpm', String(bpmValue())); form.append('key', keyValue()); form.append('audio_format', 'wav');
    if (action === 'repaint') { form.append('start', q('#sonara-ai-start').value); form.append('end', q('#sonara-ai-end').value); form.append('prompt', q('#sonara-ai-edit-prompt').value); }
    if (action === 'complete') { form.append('prompt', q('#sonara-ai-edit-prompt').value || 'Complete the arrangement naturally.'); form.append('trackClasses', JSON.stringify(['drums','bass','keys','guitar'])); }
    if (action === 'stems') { const selected = Array.from(stemChecks.querySelectorAll("input[type='checkbox']:checked")).map(function(input){ return input.value; }); form.append('stems', JSON.stringify(selected)); }
    if (action === 'regenerate-stem') { form.append('stem', stemSelect.value); form.append('prompt', q('#sonara-ai-stem-prompt').value); }
    if (action === 'voice') { form.append('voiceIdentity', q('#sonara-ai-voice').value); form.append('prompt', q('#sonara-ai-reference-prompt').value || 'Create an original song preserving this singer identity.'); }
    if (action === 'persona') { form.append('persona', q('#sonara-ai-persona').value); form.append('prompt', q('#sonara-ai-reference-prompt').value || 'Create an original song from this style DNA.'); }
    if (action === 'reference') { form.append('prompt', q('#sonara-ai-reference-prompt').value); form.append('influence', String(Number(q('#sonara-ai-influence').value || 55) / 100)); }
    if (action === 'cover') { form.append('prompt', q('#sonara-ai-reference-prompt').value || 'Create a polished alternate production.'); form.append('influence', String(Number(q('#sonara-ai-influence').value || 72) / 100)); }
    if (action === 'repair') { form.append('issues', q('#sonara-ai-repair-issues').value); form.append('prompt', 'Repair this master while preserving its composition and identity.'); }
    return form;
  }

  async function requestJson(path, init){
    const response = await fetch(API + path, init || {});
    const text = await response.text();
    let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Risposta SONARA Studio non valida.'); }
    if (!response.ok) throw new Error(data.error || data.message || ('HTTP ' + response.status));
    return data;
  }

  async function submit(action){
    if (!sourceFile && !sourceUrl && !['reference','voice','persona'].includes(action)) { setStatus('Seleziona prima un brano sorgente.', false); return; }
    if (['reference','voice','persona'].includes(action) && !referenceFile && !sourceFile && !sourceUrl) { setStatus('Carica un audio di riferimento.', false); return; }
    try {
      pollToken += 1; const token = pollToken;
      setStatus('Invio ' + action + ' a MoLab…', true);
      const data = await requestJson('/api/studio/' + action, { method:'POST', body:formFor(action), credentials:'include' });
      currentJob = data.jobId;
      setStatus('Job ' + action + ' avviato. Analisi e rendering in corso…', true);
      await poll(data.jobId, token);
    } catch (error) { setStatus(error && error.message ? error.message : String(error), false); }
  }

  async function poll(jobId, token){
    for (let attempt = 0; attempt < 300 && token === pollToken; attempt += 1) {
      const data = await requestJson('/api/studio/job/' + encodeURIComponent(jobId), { credentials:'include', cache:'no-store' });
      if (data.status === 'COMPLETED') { setStatus('Completato. Quality Judge eseguito sul WAV reale.', false); renderResults(data); return; }
      if (data.status === 'FAILED') throw new Error(data.error || 'Job Studio non riuscito.');
      setStatus((data.operation || 'Studio') + ' · ' + Math.round(Number(data.progress || 0)) + '%', true);
      await new Promise(function(resolve){ setTimeout(resolve, 2500); });
    }
    if (token === pollToken) setStatus('Il job continua sul server. Riapri Studio AI per ricontrollarlo.', false);
  }

  async function importIntoStudio(output){
    try {
      const response = await fetch(output.audioUrl); if (!response.ok) throw new Error('Audio non scaricabile.');
      const blob = await response.blob();
      const file = new File([blob], (output.label || 'SONARA') + '.wav', { type: blob.type || 'audio/wav' });
      const root = document.querySelector('[data-sonara-studio-section="true"] .sonara-pro-studio');
      const inputs = root ? Array.from(root.querySelectorAll("input[type='file']")) : [];
      const input = output.kind === 'stem' ? inputs[1] : inputs[0];
      if (!input) { setStatus('Apri prima la sezione Studio principale, poi premi Importa Studio.', false); return; }
      const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles:true }));
      setStatus((output.label || 'Audio') + ' importato nella timeline Studio.', false);
    } catch (error) { setStatus(error && error.message ? error.message : String(error), false); }
  }

  function renderResults(data){
    results.innerHTML = '';
    const judge = data.qualityJudge || {};
    if (judge.bestScore != null) {
      const summary = document.createElement('div'); summary.className = 'sonara-ai-output'; summary.innerHTML = "<div class='sonara-ai-output-head'><div class='sonara-ai-output-name'>Quality Judge</div><div class='sonara-ai-score'>" + judge.bestScore + "/100</div></div><div class='sonara-ai-note'>BPM rilevato: " + (judge.bestDetectedBpm == null ? 'n/d' : judge.bestDetectedBpm) + " · BPM verificato: " + (judge.bpmVerified === true ? 'SI' : judge.bpmVerified === false ? 'NO' : 'n/d') + " · Repair consigliato: " + (judge.repairRecommended ? 'SI' : 'NO') + "</div>"; results.appendChild(summary);
    }
    (data.outputs || []).forEach(function(output){
      const card = document.createElement('div'); card.className = 'sonara-ai-output';
      const score = output.quality && output.quality.qualityScore != null ? output.quality.qualityScore + '/100' : '';
      card.innerHTML = "<div class='sonara-ai-output-head'><div class='sonara-ai-output-name'>" + (output.label || 'SONARA Output') + "</div><div class='sonara-ai-score'>" + score + "</div></div><audio controls preload='metadata' src='" + output.audioUrl.replace(/'/g,'%27') + "'></audio><div class='sonara-ai-actions'><button class='sonara-ai-mini' data-use>Usa sorgente</button><button class='sonara-ai-mini' data-import>Importa Studio</button><a class='sonara-ai-mini' style='text-align:center;text-decoration:none' download href='" + output.audioUrl.replace(/'/g,'%27') + "'>Scarica</a></div>";
      card.querySelector('[data-use]').addEventListener('click', function(){ sourceFile = null; sourceFileInput.value = ''; syncSource(output.audioUrl); setStatus((output.label || 'Output') + ' impostato come nuova sorgente.', false); });
      card.querySelector('[data-import]').addEventListener('click', function(){ void importIntoStudio(output); });
      results.appendChild(card);
    });
  }

  overlay.querySelectorAll('[data-action]').forEach(function(button){ button.addEventListener('click', function(){ void submit(button.getAttribute('data-action')); }); });

  const upstreamFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const response = await upstreamFetch(input, init);
    try {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (/^\/api\/music\/job\//.test(requestUrl.pathname) && response.ok) {
        const data = await response.clone().json();
        const status = String(data.status || data.state || '').toLowerCase();
        if (['completed','complete','success','succeeded','done','finished','ready'].includes(status)) {
          const candidates = Array.isArray(data.candidates) ? data.candidates : Array.isArray(data.outputs) ? data.outputs : data.data && Array.isArray(data.data.candidates) ? data.data.candidates : [];
          const first = candidates[0];
          const url = typeof first === 'string' ? first : first && (first.audioUrl || first.audio_url || first.url || first.downloadUrl);
          if (url) syncSource(url);
        }
      }
    } catch {}
    return response;
  };

  requestJson('/api/studio/capabilities', { cache:'no-store' }).then(function(data){ if (data && data.ready) launch.title = 'Studio AI pronto · ' + data.primaryModel + ' + ' + data.stemModel; }).catch(function(){});
})();`;

async function injectStudioUi(request, response) {
  if (request.method !== 'GET' || !response.ok) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com', 'www.sonaraenterprise.com'].includes(url.hostname)) return response;
  const contentType = clean(response.headers.get('content-type')).toLowerCase();
  if (!contentType.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-studio-ai-v1')) return new Response(html, response);
  const injection = `<style id="sonara-studio-ai-v1-style">${STUDIO_CSS}</style><script id="sonara-studio-ai-v1">${STUDIO_UI.replace(/<\/script/gi, '<\\/script')}</script>`;
  const nextHtml = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-studio', VERSION);
  return new Response(nextHtml, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/studio/')) {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'GET' && url.pathname === '/api/studio/capabilities') {
      return json(request, capabilities());
    }
    const jobMatch = url.pathname.match(STUDIO_JOB_PATH);
    if (request.method === 'GET' && jobMatch) {
      return studioJob(request, env, decodeURIComponent(jobMatch[1]));
    }
    const operations = {
      '/api/studio/repaint': 'repaint',
      '/api/studio/cover': 'cover',
      '/api/studio/reference': 'reference',
      '/api/studio/persona': 'persona',
      '/api/studio/voice': 'voice',
      '/api/studio/stems': 'stems',
      '/api/studio/regenerate-stem': 'regenerate-stem',
      '/api/studio/complete': 'complete',
      '/api/studio/repair': 'repair'
    };
    if (request.method === 'POST' && operations[url.pathname]) {
      return createStudioJob(request, env, operations[url.pathname]);
    }

    let response = await runtime.fetch(request, env, ctx);
    if (response.ok && ['/api/health', '/api/engine/ready', '/api/molab/ready'].includes(url.pathname)) {
      const contentType = clean(response.headers.get('content-type')).toLowerCase();
      if (contentType.includes('application/json')) {
        try {
          const data = await response.json();
          return json(request, { ...data, studioAi: capabilities() });
        } catch {}
      }
    }
    response = await injectStudioUi(request, response);
    return response;
  }
};
