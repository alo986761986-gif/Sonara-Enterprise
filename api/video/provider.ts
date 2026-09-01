import { randomUUID } from 'node:crypto';
import { cert, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { SONARA_PLANS, type SonaraPlanId, type SonaraVideoResolution } from '../../src/billing/plans';

export type SonaraVideoProvider = 'molab' | 'gemini' | 'vertex';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const VERTEX_LOCATION = 'us-central1';
const GEMINI_MEDIA_CACHE_TTL_MS = 60_000;
const GEMINI_MEDIA_CACHE_MAX_ENTRIES = 48;

type GeminiLoadedReference = { bytesBase64Encoded: string; mimeType: string };
type GeminiMediaCacheEntry = { expiresAt: number; value: Promise<GeminiLoadedReference> };
type VertexAccessTokenCache = { accessToken: string; expiresAt: number };

// Video AI routes historically require FIREBASE_SERVICE_ACCOUNT_JSON for
// Firestore billing/job state. Reuse the already configured server-only
// Vertex service account when a dedicated Firebase credential is absent.
// This happens at module load, before status/generate/job initialize Admin.
if (!String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()) {
  const sharedServiceAccount = String(process.env.SONARA_VERTEX_SERVICE_ACCOUNT_JSON || '').trim();
  if (sharedServiceAccount) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = sharedServiceAccount;
}

const geminiMediaCache = new Map<string, GeminiMediaCacheEntry>();
let vertexTokenCache: VertexAccessTokenCache | null = null;

function geminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim();
}

function molabBaseUrl() {
  return String(process.env.SONARA_MOLAB_VIDEO_URL || '').trim().replace(/\/+$/, '');
}

function molabToken() {
  return String(process.env.SONARA_MOLAB_VIDEO_TOKEN || '').trim();
}

function molabConfigured() {
  const url = molabBaseUrl();
  return /^https?:\/\//i.test(url) && Boolean(molabToken());
}

function molabFrames() {
  const raw = Number(process.env.SONARA_MOLAB_VIDEO_FRAMES || 49);
  const clamped = Math.max(17, Math.min(193, Number.isFinite(raw) ? Math.round(raw) : 49));
  return Math.max(17, Math.floor((clamped - 1) / 4) * 4 + 1);
}

function molabSteps() {
  const raw = Number(process.env.SONARA_MOLAB_VIDEO_STEPS || 20);
  return Math.max(10, Math.min(50, Number.isFinite(raw) ? Math.round(raw) : 20));
}

function projectId(app: App) {
  return String(process.env.SONARA_VERTEX_PROJECT_ID || process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || app.options.projectId || '').trim();
}

function vertexCredential(app: App) {
  const separateServiceAccount = String(process.env.SONARA_VERTEX_SERVICE_ACCOUNT_JSON || '').trim();
  if (separateServiceAccount) return cert(JSON.parse(separateServiceAccount));
  return app.options.credential;
}

function hasVertexCredential(app: App) {
  return Boolean(String(process.env.SONARA_VERTEX_SERVICE_ACCOUNT_JSON || '').trim() || app.options.credential);
}

async function vertexAccessToken(app: App) {
  const now = Date.now();
  if (vertexTokenCache && vertexTokenCache.expiresAt > now + 60_000) return vertexTokenCache.accessToken;
  const credential = vertexCredential(app);
  if (!credential) throw new Error('Google service account credential non disponibile.');
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Impossibile ottenere un access token Google Cloud.');
  const expiresInSeconds = Math.max(60, Number(token.expires_in || 3600));
  vertexTokenCache = { accessToken: token.access_token, expiresAt: now + Math.max(30, expiresInSeconds - 60) * 1000 };
  return token.access_token;
}

async function providerJson(response: Response, providerLabel: string): Promise<any> {
  const raw = await response.text();
  const text = raw.trim();
  if (!text) throw new Error(`${providerLabel} ha restituito una risposta vuota (HTTP ${response.status}).`);
  if (/^<!doctype\s+html/i.test(text) || /^<html/i.test(text)) throw new Error(`${providerLabel} ha restituito HTML invece di JSON (HTTP ${response.status}).`);
  try { return JSON.parse(text); }
  catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`${providerLabel} ha restituito una risposta non JSON (HTTP ${response.status})${preview ? `: ${preview}` : ''}.`);
  }
}

function vertexModelOverride() {
  return String(process.env.SONARA_VERTEX_VIDEO_MODEL || '').trim();
}

export function videoProviderMode(app: App, bucketName: string): SonaraVideoProvider | null {
  if (molabConfigured()) return 'molab';
  if (!bucketName) return null;
  if (geminiApiKey()) return 'gemini';
  if (projectId(app) && hasVertexCredential(app)) return 'vertex';
  return null;
}

export function videoProviderReady(app: App, bucketName: string) {
  return Boolean(videoProviderMode(app, bucketName));
}

export function videoModelForPlan(planId: SonaraPlanId, provider: SonaraVideoProvider) {
  if (provider === 'molab') return String(process.env.SONARA_MOLAB_VIDEO_MODEL || 'wan2.2-ti2v-5b').trim() || 'wan2.2-ti2v-5b';
  const override = String(process.env.SONARA_VIDEO_MODEL || '').trim();
  if (override) return override;
  if (provider === 'vertex') return vertexModelOverride() || 'veo-3.1-fast-generate-001';
  return SONARA_PLANS[planId].videoModelTier === 'lite' ? 'veo-3.1-lite-generate-preview' : 'veo-3.1-fast-generate-preview';
}

export type SonaraVideoReferenceImage = { storagePath: string; contentType?: string };

export interface StartVideoProviderInput {
  app: App;
  bucketName: string;
  planId: SonaraPlanId;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: '16:9' | '9:16';
  resolution: SonaraVideoResolution;
  userId: string;
  referenceImages?: SonaraVideoReferenceImage[];
}

export interface StartedVideoProviderJob { provider: SonaraVideoProvider; model: string; operationName: string }

function safeReferenceImages(input: StartVideoProviderInput) {
  return (Array.isArray(input.referenceImages) ? input.referenceImages : [])
    .filter(item => item && typeof item.storagePath === 'string' && item.storagePath.trim())
    .slice(0, 3)
    .map(item => ({ storagePath: item.storagePath.trim(), contentType: String(item.contentType || 'image/jpeg').trim() || 'image/jpeg' }));
}

function pruneGeminiMediaCache(now: number) {
  if (geminiMediaCache.size < GEMINI_MEDIA_CACHE_MAX_ENTRIES) return;
  for (const [key, entry] of geminiMediaCache) if (entry.expiresAt <= now) geminiMediaCache.delete(key);
  if (geminiMediaCache.size < GEMINI_MEDIA_CACHE_MAX_ENTRIES) return;
  const oldestKey = geminiMediaCache.keys().next().value;
  if (typeof oldestKey === 'string') geminiMediaCache.delete(oldestKey);
}

async function loadGeminiReference(input: StartVideoProviderInput, item: { storagePath: string; contentType: string }): Promise<GeminiLoadedReference> {
  const now = Date.now();
  const key = `${input.bucketName}:${item.storagePath}:${item.contentType}`;
  const cached = geminiMediaCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) geminiMediaCache.delete(key);
  pruneGeminiMediaCache(now);
  const bucket = getStorage(input.app).bucket(input.bucketName);
  const value = bucket.file(item.storagePath).download().then(([bytes]) => ({ bytesBase64Encoded: bytes.toString('base64'), mimeType: item.contentType }));
  geminiMediaCache.set(key, { expiresAt: now + GEMINI_MEDIA_CACHE_TTL_MS, value });
  try { return await value; }
  catch (cause) {
    const active = geminiMediaCache.get(key);
    if (active?.value === value) geminiMediaCache.delete(key);
    throw cause;
  }
}

async function geminiMedia(input: StartVideoProviderInput) {
  const refs = safeReferenceImages(input);
  if (!refs.length) return {};
  const loaded = await Promise.all(refs.map(item => loadGeminiReference(input, item)));
  return { image: loaded[0], ...(loaded.length > 1 ? { referenceImages: loaded.slice(1).map(image => ({ image, referenceType: 'asset' })) } : {}) };
}

function vertexMedia(input: StartVideoProviderInput) {
  const refs = safeReferenceImages(input);
  if (!refs.length) return {};
  const loaded = refs.map(item => ({ gcsUri: `gs://${input.bucketName}/${item.storagePath}`, mimeType: item.contentType }));
  return { image: loaded[0], ...(loaded.length > 1 ? { referenceImages: loaded.slice(1).map(image => ({ image, referenceType: 'asset' })) } : {}) };
}

export async function startVideoProvider(input: StartVideoProviderInput): Promise<StartedVideoProviderJob> {
  const provider = videoProviderMode(input.app, input.bucketName);
  if (!provider) throw new Error('Nessun provider Video AI configurato.');
  const model = videoModelForPlan(input.planId, provider);
  const negativePrompt = String(input.negativePrompt || '').trim();

  if (provider === 'molab') {
    const response = await fetch(`${molabBaseUrl()}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sonara-token': molabToken() },
      body: JSON.stringify({
        prompt: input.prompt,
        ...(negativePrompt ? { negativePrompt } : {}),
        aspectRatio: input.aspectRatio,
        frames: molabFrames(),
        steps: molabSteps()
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000)
    });
    const payload = await providerJson(response, 'MoLab Video AI');
    const jobId = String(payload?.jobId || '').trim();
    if (!response.ok || !jobId) throw new Error(String(payload?.detail || payload?.error || `MoLab Video AI HTTP ${response.status}`));
    return { provider, model, operationName: jobId };
  }

  if (provider === 'gemini') {
    const media = await geminiMedia(input);
    const response = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:predictLongRunning`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey() },
      body: JSON.stringify({ instances: [{ prompt: input.prompt, ...media }], parameters: { numberOfVideos: 1, aspectRatio: input.aspectRatio, resolution: input.resolution, durationSeconds: '8', ...(negativePrompt ? { negativePrompt } : {}) } }),
      cache: 'no-store', signal: AbortSignal.timeout(20_000)
    });
    const payload = await providerJson(response, 'Gemini Video API');
    if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Gemini Video API HTTP ${response.status}`));
    return { provider, model, operationName: String(payload.name) };
  }

  const token = await vertexAccessToken(input.app);
  const id = projectId(input.app);
  const storageUri = `gs://${input.bucketName}/generated-videos/provider/${input.userId}/${Date.now()}-${randomUUID()}/`;
  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(model)}:predictLongRunning`;
  const media = vertexMedia(input);
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ instances: [{ prompt: input.prompt, ...media }], parameters: { aspectRatio: input.aspectRatio, durationSeconds: 8, resolution: input.resolution, sampleCount: 1, storageUri, ...(negativePrompt ? { negativePrompt } : {}) } }),
    cache: 'no-store', signal: AbortSignal.timeout(20_000)
  });
  const payload = await providerJson(response, 'Vertex AI Video');
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Vertex AI Video HTTP ${response.status}`));
  return { provider, model, operationName: String(payload.name) };
}

export interface PollVideoProviderInput { app: App; provider: SonaraVideoProvider; model: string; operationName: string }
export interface PolledVideoProviderJob { done: boolean; error?: string; uri?: string }

function stringValue(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function generatedSampleUri(value: any) { return typeof value === 'string' ? value.trim() : stringValue(value?.video?.uri || value?.video?.gcsUri || value?.uri || value?.gcsUri) }

function readVideoUri(operation: any) {
  const response = operation?.response || {};
  const nested = response?.generateVideoResponse || {};
  const candidates = [response?.videos?.[0]?.gcsUri, response?.videos?.[0]?.uri, response?.generatedVideos?.[0]?.video?.uri, response?.generatedVideos?.[0]?.video?.gcsUri, response?.result?.generatedVideos?.[0]?.video?.uri, generatedSampleUri(response?.generatedSamples?.[0]), generatedSampleUri(nested?.generatedSamples?.[0]), nested?.videos?.[0]?.gcsUri, nested?.videos?.[0]?.uri];
  for (const candidate of candidates) { const uri = stringValue(candidate); if (uri) return uri; }
  return '';
}

function completedWithoutVideoMessage(operation: any) {
  const response = operation?.response || {};
  const nested = response?.generateVideoResponse || {};
  const reasons = [...(Array.isArray(response?.raiMediaFilteredReasons) ? response.raiMediaFilteredReasons : []), ...(Array.isArray(nested?.raiMediaFilteredReasons) ? nested.raiMediaFilteredReasons : [])].map((item: unknown) => stringValue(item)).filter(Boolean);
  const filteredCount = Math.max(Number(response?.raiMediaFilteredCount || 0), Number(nested?.raiMediaFilteredCount || 0));
  const raiMessage = stringValue(response?.raiErrorMessage || nested?.raiErrorMessage || response?.raiTextFilteredReason?.reason || nested?.raiTextFilteredReason?.reason);
  if (filteredCount > 0 || reasons.length || raiMessage) { const detail = raiMessage || reasons.join('; '); return `Veo ha filtrato il risultato della scena${detail ? `: ${detail}` : ' per i controlli di sicurezza'}.`; }
  return 'Il provider ha completato il job senza restituire il file video.';
}

export async function pollVideoProvider(input: PollVideoProviderInput): Promise<PolledVideoProviderJob> {
  if (input.provider === 'molab') {
    const response = await fetch(`${molabBaseUrl()}/job/${encodeURIComponent(input.operationName)}`, {
      headers: { 'x-sonara-token': molabToken() },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000)
    });
    const operation = await providerJson(response, 'MoLab Video job');
    if (!response.ok) throw new Error(String(operation?.detail || operation?.error || `MoLab Video job HTTP ${response.status}`));
    const status = String(operation?.status || '').trim().toUpperCase();
    if (status === 'FAILED') return { done: true, error: String(operation?.error || 'Generazione Wan 2.2 fallita su MoLab.') };
    if (status === 'COMPLETED') {
      const uri = String(operation?.uri || '').trim();
      return uri ? { done: true, uri } : { done: true, error: 'MoLab ha completato il job senza restituire il file video.' };
    }
    return { done: false };
  }

  let response: Response;
  if (input.provider === 'gemini') {
    response = await fetch(`${GEMINI_BASE_URL}/${input.operationName}`, { headers: { 'x-goog-api-key': geminiApiKey() }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  } else {
    const token = await vertexAccessToken(input.app);
    const id = projectId(input.app);
    const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(input.model)}:fetchPredictOperation`;
    response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ operationName: input.operationName }), cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  }
  const operation = await providerJson(response, input.provider === 'gemini' ? 'Gemini Video operation' : 'Vertex Video operation');
  if (!response.ok) throw new Error(String(operation?.error?.message || `Video operation HTTP ${response.status}`));
  if (!operation.done) return { done: false };
  if (operation.error) return { done: true, error: String(operation.error?.message || 'Generazione video interrotta dal provider.') };
  const uri = readVideoUri(operation);
  if (!uri) {
    console.warn('[SONARA VIDEO] completed provider operation missing video', { provider: input.provider, model: input.model, operationName: input.operationName, responseKeys: Object.keys(operation?.response || {}), raiMediaFilteredCount: Number(operation?.response?.raiMediaFilteredCount || 0), raiMediaFilteredReasons: operation?.response?.raiMediaFilteredReasons || [] });
    return { done: true, error: completedWithoutVideoMessage(operation) };
  }
  return { done: true, uri };
}

export async function persistProviderVideo(app: App, bucketName: string, userId: string, jobId: string, uri: string, finalPathOverride?: string) {
  const base = molabBaseUrl();
  const isMolabUri = Boolean(base && uri.startsWith(`${base}/`));

  if (isMolabUri) {
    if (!bucketName) return uri;
    try {
      const response = await fetch(uri, {
        headers: { 'x-sonara-token': molabToken() },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000)
      });
      if (!response.ok) throw new Error(`Download video MoLab HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const token = randomUUID();
      const finalPath = finalPathOverride || `generated-videos/${userId}/${jobId}.mp4`;
      const bucket = getStorage(app).bucket(bucketName);
      await bucket.file(finalPath).save(bytes, {
        resumable: false,
        contentType: 'video/mp4',
        metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } }
      });
      return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(finalPath)}?alt=media&token=${encodeURIComponent(token)}`;
    } catch (cause) {
      console.warn('[SONARA VIDEO] Firebase persistence unavailable for MoLab result; using direct MoLab URL.', cause);
      return uri;
    }
  }

  if (!bucketName) throw new Error('Firebase Storage non configurato per salvare il video.');
  const token = randomUUID();
  const bucket = getStorage(app).bucket(bucketName);
  const finalPath = finalPathOverride || `generated-videos/${userId}/${jobId}.mp4`;
  if (uri.startsWith('gs://')) {
    const withoutScheme = uri.slice(5);
    const slash = withoutScheme.indexOf('/');
    const sourceBucketName = slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme;
    const sourcePath = slash >= 0 ? withoutScheme.slice(slash + 1) : '';
    if (!sourcePath) throw new Error('URI Google Cloud Storage video non valido.');
    const sourceBucket = getStorage(app).bucket(sourceBucketName);
    const sourceFile = sourceBucket.file(sourcePath);
    if (sourceBucketName === bucketName && sourcePath === finalPath) await sourceFile.setMetadata({ contentType: 'video/mp4', cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } });
    else { await sourceFile.copy(bucket.file(finalPath)); await bucket.file(finalPath).setMetadata({ contentType: 'video/mp4', cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } }); }
  } else {
    const headers: Record<string, string> = {};
    if (geminiApiKey()) headers['x-goog-api-key'] = geminiApiKey();
    const response = await fetch(uri, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Download video provider HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await bucket.file(finalPath).save(bytes, { resumable: false, contentType: 'video/mp4', metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } } });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(finalPath)}?alt=media&token=${encodeURIComponent(token)}`;
}
