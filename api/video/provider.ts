import { randomUUID } from 'node:crypto';
import type { App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { SONARA_PLANS, type SonaraPlanId, type SonaraVideoResolution } from '../../src/billing/plans';

export type SonaraVideoProvider = 'gemini' | 'vertex';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const VERTEX_LOCATION = 'us-central1';

function geminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim();
}

function projectId(app: App) {
  return String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    app.options.projectId ||
    ''
  ).trim();
}

async function vertexAccessToken(app: App) {
  const credential = app.options.credential;
  if (!credential) throw new Error('Google service account credential non disponibile.');
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Impossibile ottenere un access token Google Cloud.');
  return token.access_token;
}

async function providerJson(response: Response, providerLabel: string): Promise<any> {
  const raw = await response.text();
  const text = raw.trim();
  if (!text) {
    throw new Error(`${providerLabel} ha restituito una risposta vuota (HTTP ${response.status}).`);
  }
  if (/^<!doctype\s+html/i.test(text) || /^<html/i.test(text)) {
    throw new Error(`${providerLabel} ha restituito HTML invece di JSON (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`${providerLabel} ha restituito una risposta non JSON (HTTP ${response.status})${preview ? `: ${preview}` : ''}.`);
  }
}

function vertexModelOverride() {
  return String(process.env.SONARA_VERTEX_VIDEO_MODEL || '').trim();
}

export function videoProviderMode(app: App, bucketName: string): SonaraVideoProvider | null {
  if (!bucketName) return null;
  if (geminiApiKey()) return 'gemini';
  if (projectId(app) && app.options.credential) return 'vertex';
  return null;
}

export function videoProviderReady(app: App, bucketName: string) {
  return Boolean(videoProviderMode(app, bucketName));
}

export function videoModelForPlan(planId: SonaraPlanId, provider: SonaraVideoProvider) {
  const override = String(process.env.SONARA_VIDEO_MODEL || '').trim();
  if (override) return override;
  if (provider === 'vertex') return vertexModelOverride() || 'veo-3.1-fast-generate-001';
  return SONARA_PLANS[planId].videoModelTier === 'lite'
    ? 'veo-3.1-lite-generate-preview'
    : 'veo-3.1-fast-generate-preview';
}

export interface StartVideoProviderInput {
  app: App;
  bucketName: string;
  planId: SonaraPlanId;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: SonaraVideoResolution;
  userId: string;
}

export interface StartedVideoProviderJob {
  provider: SonaraVideoProvider;
  model: string;
  operationName: string;
}

export async function startVideoProvider(input: StartVideoProviderInput): Promise<StartedVideoProviderJob> {
  const provider = videoProviderMode(input.app, input.bucketName);
  if (!provider) throw new Error('Nessun provider Video AI configurato.');
  const model = videoModelForPlan(input.planId, provider);

  if (provider === 'gemini') {
    const response = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:predictLongRunning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey() },
      body: JSON.stringify({
        instances: [{ prompt: input.prompt }],
        parameters: {
          numberOfVideos: 1,
          aspectRatio: input.aspectRatio,
          resolution: input.resolution,
          durationSeconds: '8',
          personGeneration: 'allow_adult'
        }
      })
    });
    const payload = await providerJson(response, 'Gemini Video API');
    if (!response.ok || !payload?.name) {
      throw new Error(String(payload?.error?.message || `Gemini Video API HTTP ${response.status}`));
    }
    return { provider, model, operationName: String(payload.name) };
  }

  const token = await vertexAccessToken(input.app);
  const id = projectId(input.app);
  const storageUri = `gs://${input.bucketName}/generated-videos/provider/${input.userId}/${Date.now()}-${randomUUID()}/`;
  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(model)}:predictLongRunning`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      instances: [{ prompt: input.prompt }],
      parameters: {
        aspectRatio: input.aspectRatio,
        durationSeconds: 8,
        resolution: input.resolution,
        sampleCount: 1,
        personGeneration: 'allow_adult',
        storageUri
      }
    })
  });
  const payload = await providerJson(response, 'Vertex AI Video');
  if (!response.ok || !payload?.name) {
    throw new Error(String(payload?.error?.message || `Vertex AI Video HTTP ${response.status}`));
  }
  return { provider, model, operationName: String(payload.name) };
}

export interface PollVideoProviderInput {
  app: App;
  provider: SonaraVideoProvider;
  model: string;
  operationName: string;
}

export interface PolledVideoProviderJob {
  done: boolean;
  error?: string;
  uri?: string;
}

function readVideoUri(operation: any) {
  return String(
    operation?.response?.videos?.[0]?.gcsUri ||
    operation?.response?.videos?.[0]?.uri ||
    operation?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    operation?.response?.generatedSamples?.[0]?.video?.uri ||
    operation?.response?.generatedVideos?.[0]?.video?.uri ||
    ''
  );
}

export async function pollVideoProvider(input: PollVideoProviderInput): Promise<PolledVideoProviderJob> {
  let response: Response;
  if (input.provider === 'gemini') {
    response = await fetch(`${GEMINI_BASE_URL}/${input.operationName}`, {
      headers: { 'x-goog-api-key': geminiApiKey() },
      cache: 'no-store'
    });
  } else {
    const token = await vertexAccessToken(input.app);
    const id = projectId(input.app);
    const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/${VERTEX_LOCATION}/publishers/google/models/${encodeURIComponent(input.model)}:fetchPredictOperation`;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ operationName: input.operationName }),
      cache: 'no-store'
    });
  }

  const operation = await providerJson(response, input.provider === 'gemini' ? 'Gemini Video operation' : 'Vertex Video operation');
  if (!response.ok) throw new Error(String(operation?.error?.message || `Video operation HTTP ${response.status}`));
  if (!operation.done) return { done: false };
  if (operation.error) return { done: true, error: String(operation.error?.message || 'Generazione video interrotta dal provider.') };
  const uri = readVideoUri(operation);
  if (!uri) return { done: true, error: 'Il provider ha completato il job senza restituire il file video.' };
  return { done: true, uri };
}

export async function persistProviderVideo(app: App, bucketName: string, userId: string, jobId: string, uri: string, finalPathOverride?: string) {
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
    if (sourceBucketName === bucketName && sourcePath === finalPath) {
      await sourceFile.setMetadata({
        contentType: 'video/mp4',
        cacheControl: 'private,max-age=3600',
        metadata: { firebaseStorageDownloadTokens: token }
      });
    } else {
      await sourceFile.copy(bucket.file(finalPath));
      await bucket.file(finalPath).setMetadata({
        contentType: 'video/mp4',
        cacheControl: 'private,max-age=3600',
        metadata: { firebaseStorageDownloadTokens: token }
      });
    }
  } else {
    const headers: Record<string, string> = {};
    if (geminiApiKey()) headers['x-goog-api-key'] = geminiApiKey();
    const response = await fetch(uri, { headers, redirect: 'follow' });
    if (!response.ok) throw new Error(`Download video provider HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await bucket.file(finalPath).save(bytes, {
      resumable: false,
      contentType: 'video/mp4',
      metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } }
    });
  }

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(finalPath)}?alt=media&token=${encodeURIComponent(token)}`;
}
