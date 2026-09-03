import { handleMusicCoverRequest } from '../../src/server/musicCoverApi';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
export const maxDuration = 300;

const VERSION = 'sonara-eleven-music-v2-1';
const MODEL_ID = 'music_v2';
const JOB_COLLECTION = 'sonaraElevenMusicJobs';
const DEFAULT_OUTPUT_FORMAT = 'mp3_48000_192';
const MAX_PROMPT_CHARS = 4100;
const MIN_DURATION_MS = 3000;
const MAX_DURATION_MS = 600000;

interface Candidate {
  id: 'A' | 'B';
  audioUrl: string;
  audioFormat: string;
  provider: 'eleven_music';
  model: 'music_v2';
  songId?: string;
  storagePath: string;
}

let adminApp: App | null = null;

function clean(value: unknown, fallback = ''): string {
  const output = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return output || fallback;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function actionFromRequest(req: any): string {
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (queryPath) return queryPath.replace(/^\/+|\/+$/g, '').toLowerCase();
  const pathname = String(req.url || '').split(/[?#]/, 1)[0];
  return String(pathname.match(/\/api\/eleven-music(?:\/(.*))?\/?$/i)?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Sonara-Music-Provider', VERSION);
  return res.status(status).json(body);
}

function fail(res: any, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json(res, status, { error: { code, message }, ...extra });
}

function internalAuthorized(req: any): boolean {
  const expected = clean(process.env.SONARA_INTERNAL_PROXY_SECRET);
  if (!expected) return true;
  return clean(req.headers?.['x-sonara-internal-secret']) === expected;
}

function storageBucketName(): string {
  return clean(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET);
}

function serviceAccountConfigured(): boolean {
  return Boolean(clean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS));
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) return adminApp = existing;
  const serviceAccountJson = clean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = clean(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT);
  const bucket = storageBucketName();
  adminApp = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(projectId ? { projectId } : {}),
    ...(bucket ? { storageBucket: bucket } : {})
  });
  return adminApp;
}

function outputFormat(): string {
  return clean(process.env.ELEVEN_MUSIC_OUTPUT_FORMAT, DEFAULT_OUTPUT_FORMAT);
}

function extensionForFormat(format: string): string {
  if (format.startsWith('pcm_')) return 'wav';
  if (format.startsWith('wav_')) return 'wav';
  if (format.startsWith('opus_')) return 'opus';
  if (format.startsWith('ulaw_')) return 'ulaw';
  if (format.startsWith('alaw_')) return 'alaw';
  return 'mp3';
}

function mimeForFormat(format: string): string {
  const ext = extensionForFormat(format);
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'opus') return 'audio/ogg';
  if (ext === 'ulaw' || ext === 'alaw') return 'audio/basic';
  return 'audio/mpeg';
}

function extractCreatorBrief(body: Record<string, any>): string {
  const explicit = clean(
    body.sonaraCreatorPromptAuthoritative ||
    body.sonaraOriginalCreatorBrief ||
    body.rawPrompt ||
    body.creatorPrompt ||
    body.creator_prompt ||
    body.musicPrompt
  );
  if (explicit) return explicit.slice(0, 2400);
  const prompt = clean(body.prompt);
  const match = prompt.match(/CREATOR BRIEF\s*—?\s*VERBATIM:\s*<<<\s*([\s\S]*?)\s*>>>/i);
  return clean(match?.[1] || prompt).slice(0, 2400);
}

function buildPrompt(body: Record<string, any>, durationSec: number): string {
  const creator = extractCreatorBrief(body);
  const family = clean(body.genreFamily || body.genre_family);
  const genre = clean(body.genre, 'Music');
  const subgenre = clean(body.subgenre, genre);
  const mood = clean(body.mood || body.atmosphere, 'Authentic');
  const bpm = Math.round(clamp(body.bpm ?? body.requestedBpm, 124, 40, 220));
  const key = clean(body.key || body.key_scale);
  const vocalMode = clean(body.vocalMode || body.vocal_mode, body.lyrics ? 'vocal' : 'instrumental').toLowerCase();
  const language = clean(body.vocalLanguage || body.language || body.lyricsLanguage || body.lyrics_language, 'auto');
  const lyrics = clean(body.lyrics);
  const weirdness = Math.round(clamp(body.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));

  const parts = [
    'Create a finished, release-ready original song. Follow the creator brief as the primary artistic instruction.',
    creator ? `CREATOR BRIEF: ${creator}` : '',
    `MUSICAL IDENTITY: ${[family, genre, subgenre].filter(Boolean).join(' > ')}. Mood/atmosphere: ${mood}.`,
    `TEMPO AND TONALITY: ${bpm} BPM${key ? `, ${key}` : ''}. Keep the tempo stable throughout the song.`,
    `TARGET LENGTH: ${durationSec} seconds. Build a complete arrangement that naturally fills this duration and ends musically.`,
    `CREATIVE CONTROLS: weirdness ${weirdness}/100; style influence ${styleInfluence}/100. Preserve the selected genre and creator intent.`,
    vocalMode === 'instrumental'
      ? 'VOCALS: strictly instrumental. Do not generate singing, speech, chants or vocal ad-libs.'
      : `VOCALS: ${vocalMode}; language ${language}. Use a coherent lead-vocal identity and natural phrasing.`,
    lyrics && vocalMode !== 'instrumental'
      ? `LYRICS TO PERFORM. Preserve these lyrics and their language; do not replace them with unrelated words:\n${lyrics.slice(0, 5000)}`
      : '',
    'PRODUCTION: professional arrangement, convincing instrumentation, clean transients, controlled low end, clear separation, musical dynamics and a polished commercial master. Avoid generic filler, long empty intros, abrupt truncation and genre drift.'
  ].filter(Boolean);

  return parts.join('\n\n').slice(0, MAX_PROMPT_CHARS);
}

async function providerError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (!raw) return `Eleven Music HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw);
    return clean(parsed?.detail?.message || parsed?.detail || parsed?.message || parsed?.error, `Eleven Music HTTP ${response.status}`);
  } catch {
    return raw.slice(0, 500);
  }
}

async function generateAudio(prompt: string, durationMs: number, instrumental: boolean): Promise<{ bytes: Buffer; songId: string }> {
  const apiKey = clean(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY);
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY_MISSING');

  const format = outputFormat();
  const endpoint = `https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(format)}`;
  const requestBody = {
    prompt,
    music_length_ms: Math.round(clamp(durationMs, 30000, MIN_DURATION_MS, MAX_DURATION_MS)),
    model_id: MODEL_ID,
    force_instrumental: instrumental,
    store_for_inpainting: false,
    sign_with_c2pa: format.startsWith('mp3_')
  };

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: mimeForFormat(format)
      },
      body: JSON.stringify(requestBody)
    });
    if (response.ok) {
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        songId: clean(response.headers.get('song-id'))
      };
    }
    lastError = await providerError(response);
    if (response.status !== 429 || attempt > 0) {
      throw new Error(`ELEVEN_MUSIC_${response.status}: ${lastError}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1800));
  }
  throw new Error(lastError || 'ELEVEN_MUSIC_GENERATION_FAILED');
}

async function persistCandidate(uid: string, jobId: string, id: 'A' | 'B', audio: Buffer, songId: string): Promise<Candidate> {
  const bucketName = storageBucketName();
  if (!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET_MISSING');
  const format = outputFormat();
  const ext = extensionForFormat(format);
  const mime = mimeForFormat(format);
  const safeUid = clean(uid, 'anonymous').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'anonymous';
  const storagePath = `music/eleven-v2/${safeUid}/${jobId}/candidate-${id}.${ext}`;
  const bucket = getStorage(getAdminApp()).bucket(bucketName);
  const file = bucket.file(storagePath);
  await file.save(audio, {
    resumable: false,
    contentType: mime,
    metadata: {
      cacheControl: 'private,max-age=3600',
      metadata: {
        sonaraProvider: 'eleven_music',
        sonaraModel: MODEL_ID,
        sonaraJobId: jobId,
        sonaraCandidate: id,
        elevenSongId: songId || ''
      }
    }
  });
  const [audioUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  return {
    id,
    audioUrl,
    audioFormat: ext,
    provider: 'eleven_music',
    model: MODEL_ID,
    songId: songId || undefined,
    storagePath
  };
}

async function createGeneration(body: Record<string, any>, res: any) {
  if (!serviceAccountConfigured()) return fail(res, 503, 'FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin non è configurato per salvare i brani Eleven Music.');
  if (!storageBucketName()) return fail(res, 503, 'FIREBASE_STORAGE_NOT_CONFIGURED', 'Firebase Storage non è configurato per i brani Eleven Music.');
  if (!clean(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY)) {
    return fail(res, 503, 'ELEVEN_MUSIC_NOT_CONFIGURED', 'La chiave ElevenLabs non è ancora configurata sul server SONARA.');
  }

  const uid = clean(body.sonaraUserUid || body.userUid, 'anonymous');
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 60, 30, 480));
  const durationMs = durationSec * 1000;
  const prompt = buildPrompt(body, durationSec);
  if (prompt.length < 8) return fail(res, 400, 'MUSIC_PROMPT_REQUIRED', 'Inserisci un prompt musicale più completo.');
  const vocalMode = clean(body.vocalMode || body.vocal_mode, body.lyrics ? 'vocal' : 'instrumental').toLowerCase();
  const instrumental = /instrumental|no vocals|senza voce/.test(vocalMode) && !clean(body.lyrics);
  const candidateCount = Math.round(clamp(body.candidateCount ?? body.candidate_count, 2, 1, 2));
  const jobId = `eleven_${crypto.randomUUID()}`;
  const firestore = getFirestore(getAdminApp());
  const ref = firestore.collection(JOB_COLLECTION).doc(jobId);
  const startedAt = Date.now();

  await ref.set({
    uid,
    status: 'PROCESSING',
    progress: 5,
    provider: 'eleven_music',
    model: MODEL_ID,
    durationSec,
    candidateCount,
    promptPreview: prompt.slice(0, 600),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  try {
    const ids = (candidateCount === 2 ? ['A', 'B'] : ['A']) as Array<'A' | 'B'>;
    const generated = await Promise.all(ids.map(async id => {
      const track = await generateAudio(prompt, durationMs, instrumental);
      return persistCandidate(uid, jobId, id, track.bytes, track.songId);
    }));
    const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
    await ref.set({
      status: 'COMPLETED',
      progress: 100,
      candidates: generated,
      audioUrls: generated.map(candidate => candidate.audioUrl),
      elapsedSec,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return json(res, 200, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: generated[0]?.audioUrl || null,
      audioUrls: generated.map(candidate => candidate.audioUrl),
      candidates: generated,
      metadata: {
        engine: 'SONARA Eleven Music v2',
        provider: 'eleven_music',
        model: MODEL_ID,
        candidateCount: generated.length,
        requestedDurationSec: durationSec,
        elapsedSec,
        currentStage: generated.length === 2 ? '2 brani Eleven Music v2 pronti' : 'Brano Eleven Music v2 pronto'
      }
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await ref.set({
      status: 'FAILED',
      progress: 0,
      error: message,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => undefined);
    const status = message.includes('ELEVEN_MUSIC_401') ? 401
      : message.includes('ELEVEN_MUSIC_402') ? 402
        : message.includes('ELEVEN_MUSIC_429') ? 429
          : message.includes('ELEVEN_MUSIC_422') ? 422
            : 502;
    return fail(res, status, 'ELEVEN_MUSIC_GENERATION_FAILED', message, { jobId });
  }
}

async function readJob(jobId: string, res: any) {
  if (!serviceAccountConfigured()) return fail(res, 503, 'FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin non configurato.');
  const snapshot = await getFirestore(getAdminApp()).collection(JOB_COLLECTION).doc(jobId).get();
  if (!snapshot.exists) return fail(res, 404, 'ELEVEN_JOB_NOT_FOUND', 'Job Eleven Music non trovato.');
  const data = snapshot.data() || {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  return json(res, 200, {
    jobId,
    status: clean(data.status, 'PROCESSING'),
    progress: Number(data.progress || 0),
    audioUrl: candidates[0]?.audioUrl || null,
    audioUrls: candidates.map((candidate: any) => candidate.audioUrl).filter(Boolean),
    candidates,
    error: data.error || null,
    metadata: {
      engine: 'SONARA Eleven Music v2',
      provider: 'eleven_music',
      model: MODEL_ID,
      candidateCount: Number(data.candidateCount || candidates.length || 0),
      requestedDurationSec: Number(data.durationSec || 0),
      elapsedSec: data.elapsedSec ?? null,
      currentStage: data.status === 'COMPLETED' ? 'Eleven Music v2 completato' : data.status === 'FAILED' ? 'Eleven Music v2 fallito' : 'Eleven Music v2 in generazione'
    }
  });
}

export default async function handler(req: any, res: any) {
  const action = actionFromRequest(req);

  // Cover generation deliberately reuses this existing Vercel function so
  // SONARA stays within the project Serverless Function limit. The cover
  // handler performs its own native/Firebase user authentication.
  if (action === 'cover') return handleMusicCoverRequest(req, res);

  if (req.method === 'GET' && action === 'health') {
    return json(res, 200, {
      service: 'SONARA Eleven Music v2',
      version: VERSION,
      ready: Boolean(clean(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY) && serviceAccountConfigured() && storageBucketName()),
      checks: {
        elevenApiKey: Boolean(clean(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY)),
        firebaseAdmin: serviceAccountConfigured(),
        firebaseStorage: Boolean(storageBucketName())
      },
      model: MODEL_ID,
      outputFormat: outputFormat(),
      maxDurationSec: MAX_DURATION_MS / 1000
    });
  }

  if (!internalAuthorized(req)) return fail(res, 401, 'SONARA_INTERNAL_UNAUTHORIZED', 'Richiesta interna SONARA non autorizzata.');

  if (req.method === 'POST' && (action === 'generate' || action === '')) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    return createGeneration(body, res);
  }

  const jobMatch = action.match(/^job\/(eleven_[a-z0-9-]+)$/i);
  if (req.method === 'GET' && jobMatch) return readJob(jobMatch[1], res);

  return fail(res, 404, 'ELEVEN_MUSIC_ROUTE_NOT_FOUND', 'Rotta Eleven Music non trovata.');
}
