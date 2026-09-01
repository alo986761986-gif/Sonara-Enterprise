import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-studio-native-pitch-bridge.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-studio-pitch-key-upload-bridge-1';
const APPLY_PATH = '/api/studio/pitch-key';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  'https://api.sonaraenterprise.com'
]);

const clean = value => String(value ?? '').trim();
const clamp = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const snapHalf = value => Math.round(Number(value || 0) * 2) / 2;
const signed = value => `${value > 0 ? '+' : ''}${value}`;

function validKey(value) {
  const text = clean(value);
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').slice(0, 32);
  return /^[A-G](?:#|b)?(?:\s+(?:major|minor|maj|min))?$/i.test(normalized) ? normalized : '';
}

function buildIssues(body) {
  const targetKey = validKey(body.targetKey || body.key || body.keySignature);
  const trackPitch = snapHalf(clamp(body.trackPitchSemitones, 0, -12, 12));
  const vocalPitch = snapHalf(clamp(body.vocalPitchSemitones, 0, -12, 12));
  const formantShift = snapHalf(clamp(body.vocalFormantSemitones ?? body.formantShift, 0, -6, 6));
  const preserveTempo = clean(body.preserveTempo).toLowerCase() !== 'false';
  const issues = [];

  if (targetKey) {
    issues.push(`Correct all harmonic tuning and out-of-key notes to the exact target key ${targetKey}. Preserve the existing melody, chord functions, arrangement, phrasing and song identity; transpose only where needed for a musically correct ${targetKey} result.`);
  }
  if (trackPitch !== 0) {
    issues.push(`Apply an exact full-program pitch shift of ${signed(trackPitch)} semitones to the musical material${preserveTempo ? ' while preserving the original BPM, bar grid, transient timing and duration' : ''}. Do not introduce time-stretch wobble, metallic artifacts or phase smearing.`);
  }
  if (vocalPitch !== 0) {
    issues.push(`Shift the lead vocal pitch by exactly ${signed(vocalPitch)} semitones independently from the instrumental backing. Preserve lyrics, timing, phrasing, vibrato character, singer identity and natural consonants; do not detune the instrumental arrangement.`);
  }
  if (formantShift !== 0) {
    issues.push(`Shift vocal formants/timbre by exactly ${signed(formantShift)} semitones independently from pitch. Preserve musical pitch, lyrics, timing, breath detail and intelligibility; avoid chipmunk, robotic, metallic or phasey vocal artifacts.`);
  }
  issues.push('Preserve stereo image, loudness balance, dynamics, ambience and the complete arrangement unless a requested key/pitch correction requires a minimal musical adjustment.');

  return { targetKey, trackPitch, vocalPitch, formantShift, preserveTempo, issues };
}

function corsHeaders(request, headers) {
  const out = new Headers(headers);
  const origin = clean(request.headers.get('Origin'));
  if (ALLOWED_ORIGINS.has(origin)) {
    out.set('Access-Control-Allow-Origin', origin);
    out.set('Access-Control-Allow-Credentials', 'true');
    out.set('Vary', 'Origin');
  }
  out.set('x-sonara-studio-pitch-key-upload', VERSION);
  return out;
}

async function handleMultipartPitchKey(request, env, ctx) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Upload audio Pitch & Key non valido.' }), {
      status: 400,
      headers: corsHeaders(request, { 'content-type': 'application/json; charset=UTF-8' })
    });
  }

  const body = {};
  let hasSourceFile = false;
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') body[key] = value;
    else if (['src_audio', 'source_audio', 'sourceAudio', 'audio', 'file'].includes(key) && Number(value?.size || 0) > 0) hasSourceFile = true;
  }

  if (!hasSourceFile) return runtime.fetch(request, env, ctx);

  const built = buildIssues(body);
  if (!built.targetKey && built.trackPitch === 0 && built.vocalPitch === 0 && built.formantShift === 0) {
    return new Response(JSON.stringify({ error: 'Imposta una tonalita target oppure una variazione di pitch/formanti.' }), {
      status: 400,
      headers: corsHeaders(request, { 'content-type': 'application/json; charset=UTF-8' })
    });
  }

  form.set('key', built.targetKey || clean(body.key || body.keySignature));
  form.set('bpm', String(Math.round(clamp(body.bpm ?? body.requestedBpm, 124, 40, 220))));
  form.set('issues', JSON.stringify(built.issues));
  form.set('preserveStrength', String(clamp(body.preserveStrength, 0.94, 0.72, 0.99)));
  form.set('sonaraStudioPitchKey', 'true');
  form.set('sonaraStudioPitchKeyVersion', VERSION);
  form.set('targetKey', built.targetKey || '');
  form.set('trackPitchSemitones', String(built.trackPitch));
  form.set('vocalPitchSemitones', String(built.vocalPitch));
  form.set('vocalFormantSemitones', String(built.formantShift));
  form.set('preserveTempo', built.preserveTempo ? 'true' : 'false');

  // A local Studio file is authoritative. Never make the repair router refetch a stale
  // Cloudflare/MoLab URL when the actual source bytes are already attached.
  form.delete('sourceAudioUrl');
  form.delete('srcAudioUrl');
  form.delete('audioUrl');
  form.delete('source_audio_url');

  const url = new URL(request.url);
  url.pathname = '/api/studio/repair';
  url.search = '';

  const headers = new Headers(request.headers);
  headers.delete('content-type');
  headers.delete('content-length');
  headers.set('x-sonara-studio-pitch-key-upload', VERSION);

  const response = await runtime.fetch(new Request(url.toString(), {
    method: 'POST',
    headers,
    body: form
  }), env, ctx);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders(request, response.headers)
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const contentType = clean(request.headers.get('content-type')).toLowerCase();
    if (url.pathname === APPLY_PATH && request.method === 'POST' && contentType.includes('multipart/form-data')) {
      return handleMultipartPitchKey(request, env, ctx);
    }
    return runtime.fetch(request, env, ctx);
  }
};
