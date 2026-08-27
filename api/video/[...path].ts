import { randomUUID } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  SONARA_PLANS,
  SONARA_VIDEO_CREDIT_COST,
  isSonaraVideoResolution,
  type SonaraPlanId,
  type SonaraVideoResolution
} from '../../src/billing/plans';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const JOB_COLLECTION = 'sonaraVideoJobs';

interface AuthenticatedUser { uid: string; email?: string }
interface BillingRecord {
  planId?: SonaraPlanId;
  subscriptionStatus?: string;
  usagePeriodEnd?: Timestamp;
  videoCreditsUsed?: number;
  videoCreditsPeriodKey?: string;
}
interface VideoJobRecord {
  uid: string;
  operationName: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: SonaraVideoResolution;
  credits: number;
  planId: SonaraPlanId;
  model: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  providerVideoUri?: string;
  error?: string;
  refunded?: boolean;
}

let adminApp: App | null = null;

function serviceAccountConfigured() {
  return Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim() || String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim());
}

function storageBucketName() {
  return String(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) return adminApp = existing;
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '').trim();
  const bucket = storageBucketName();
  adminApp = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(projectId ? { projectId } : {}),
    ...(bucket ? { storageBucket: bucket } : {})
  });
  return adminApp;
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function fail(res: any, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json(res, status, { error: { code, message }, ...extra });
}

function bearerToken(req: any) {
  return String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function authenticatedUser(req: any): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!token || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string; email?: string }> };
    const user = payload.users?.[0];
    return user?.localId ? { uid: user.localId, email: user.email } : null;
  } catch { return null; }
}

function actionFromRequest(req: any) {
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (queryPath) return queryPath.replace(/^\/+|\/+$/g, '').toLowerCase();
  const pathname = String(req.url || '').split(/[?#]/, 1)[0];
  return String(pathname.match(/\/api\/video(?:\/(.*))?\/?$/i)?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as any).toMillis === 'function') return Number((value as any).toMillis());
  if (value && typeof (value as any)._seconds === 'number') return Number((value as any)._seconds) * 1000;
  return 0;
}

function hasPaidAccess(record: BillingRecord) {
  if (record.planId !== 'creator' && record.planId !== 'studio') return false;
  if (record.subscriptionStatus === 'active' || record.subscriptionStatus === 'trialing') return true;
  if (record.subscriptionStatus === 'past_due') return timestampToMillis(record.usagePeriodEnd) > Date.now();
  return false;
}

function effectivePlan(record: BillingRecord | undefined): SonaraPlanId {
  return record && hasPaidAccess(record) ? record.planId as SonaraPlanId : 'free';
}

function currentPeriodKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function providerApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim();
}

function providerReady() {
  return Boolean(providerApiKey() && serviceAccountConfigured() && storageBucketName());
}

function modelForPlan(planId: SonaraPlanId) {
  const override = String(process.env.SONARA_VIDEO_MODEL || '').trim();
  if (override) return override;
  return SONARA_PLANS[planId].videoModelTier === 'lite' ? 'veo-3.1-lite-generate-preview' : 'veo-3.1-fast-generate-preview';
}

async function billingRecord(uid: string): Promise<BillingRecord | undefined> {
  const snapshot = await getFirestore(getAdminApp()).collection('sonaraBilling').doc(uid).get();
  return snapshot.exists ? snapshot.data() as BillingRecord : undefined;
}

function publicStatus(record: BillingRecord | undefined) {
  const planId = effectivePlan(record);
  const plan = SONARA_PLANS[planId];
  const periodKey = currentPeriodKey();
  const used = record?.videoCreditsPeriodKey === periodKey ? Math.max(0, Number(record.videoCreditsUsed || 0)) : 0;
  return {
    planId,
    planName: plan.name,
    videoCreditsPerMonth: plan.videoCreditsPerMonth,
    videoCreditsUsed: used,
    videoCreditsRemaining: Math.max(0, plan.videoCreditsPerMonth - used),
    videoClipSeconds: plan.videoClipSeconds,
    videoResolutions: plan.videoResolutions,
    providerConfigured: providerReady()
  };
}

async function reserveVideoCredits(uid: string, resolution: SonaraVideoResolution) {
  const firestore = getFirestore(getAdminApp());
  const ref = firestore.collection('sonaraBilling').doc(uid);
  let result!: { planId: SonaraPlanId; credits: number; status: ReturnType<typeof publicStatus> };
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const record = snapshot.exists ? snapshot.data() as BillingRecord : {};
    const planId = effectivePlan(record);
    const plan = SONARA_PLANS[planId];
    if (!plan.videoResolutions.includes(resolution)) throw Object.assign(new Error('VIDEO_RESOLUTION_NOT_ALLOWED'), { planId, allowed: plan.videoResolutions });
    const credits = SONARA_VIDEO_CREDIT_COST[resolution];
    const periodKey = currentPeriodKey();
    const used = record.videoCreditsPeriodKey === periodKey ? Math.max(0, Number(record.videoCreditsUsed || 0)) : 0;
    if (used + credits > plan.videoCreditsPerMonth) throw Object.assign(new Error('VIDEO_CREDITS_EXHAUSTED'), { planId, creditsRemaining: Math.max(0, plan.videoCreditsPerMonth - used) });
    const next: BillingRecord = { ...record, videoCreditsPeriodKey: periodKey, videoCreditsUsed: used + credits };
    transaction.set(ref, { videoCreditsPeriodKey: periodKey, videoCreditsUsed: used + credits, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    result = { planId, credits, status: publicStatus(next) };
  });
  return result;
}

async function releaseVideoCredits(uid: string, credits: number, jobId?: string) {
  const firestore = getFirestore(getAdminApp());
  const ref = firestore.collection('sonaraBilling').doc(uid);
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const record = snapshot.exists ? snapshot.data() as BillingRecord : {};
    if (record.videoCreditsPeriodKey !== currentPeriodKey()) return;
    transaction.set(ref, { videoCreditsUsed: Math.max(0, Number(record.videoCreditsUsed || 0) - credits), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (jobId) transaction.set(firestore.collection(JOB_COLLECTION).doc(jobId), { refunded: true }, { merge: true });
  });
}

async function startVideo(user: AuthenticatedUser, req: any, res: any) {
  if (!providerReady()) return fail(res, 503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Il motore SONARA Video AI non è ancora configurato sul server.');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = String(body.prompt || '').trim();
  const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = body.resolution;
  if (prompt.length < 8) return fail(res, 400, 'VIDEO_PROMPT_REQUIRED', 'Descrivi il video con un prompt più completo.');
  if (prompt.length > 5000) return fail(res, 400, 'VIDEO_PROMPT_TOO_LONG', 'Il prompt video è troppo lungo.');
  if (!isSonaraVideoResolution(resolution)) return fail(res, 400, 'INVALID_VIDEO_RESOLUTION', 'Risoluzione video non valida.');

  let reservation: Awaited<ReturnType<typeof reserveVideoCredits>>;
  try { reservation = await reserveVideoCredits(user.uid, resolution); }
  catch (cause) {
    const code = cause instanceof Error ? cause.message : 'VIDEO_BILLING_ERROR';
    if (code === 'VIDEO_RESOLUTION_NOT_ALLOWED') return fail(res, 403, code, 'Questa qualità video non è inclusa nel piano attivo.', { allowed: (cause as any).allowed });
    if (code === 'VIDEO_CREDITS_EXHAUSTED') return fail(res, 402, code, 'Hai terminato i crediti Video AI del mese.', { creditsRemaining: (cause as any).creditsRemaining });
    return fail(res, 503, 'VIDEO_BILLING_ERROR', 'Il controllo dei crediti video non è disponibile.');
  }

  const model = modelForPlan(reservation.planId);
  try {
    const response = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:predictLongRunning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': providerApiKey() },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { numberOfVideos: 1, aspectRatio, resolution, durationSeconds: '8', personGeneration: 'allow_adult' }
      })
    });
    const payload = await response.json() as any;
    if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Video provider HTTP ${response.status}`));
    const jobRef = getFirestore(getAdminApp()).collection(JOB_COLLECTION).doc();
    await jobRef.set({
      uid: user.uid, operationName: String(payload.name), prompt, aspectRatio, resolution,
      credits: reservation.credits, planId: reservation.planId, model, status: 'PROCESSING', refunded: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return json(res, 202, { jobId: jobRef.id, status: 'PROCESSING', progress: 5, stage: 'SONARA Video AI: rendering avviato', billing: reservation.status });
  } catch (cause) {
    await releaseVideoCredits(user.uid, reservation.credits).catch(() => undefined);
    return fail(res, 502, 'VIDEO_PROVIDER_START_FAILED', cause instanceof Error ? cause.message : 'Avvio generazione video fallito.');
  }
}

async function persistGeneratedVideo(jobId: string, record: VideoJobRecord, uri: string) {
  const response = await fetch(uri, { headers: { 'x-goog-api-key': providerApiKey() }, redirect: 'follow' });
  if (!response.ok) throw new Error(`Download video provider HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const token = randomUUID();
  const bucketName = storageBucketName();
  const bucket = getStorage(getAdminApp()).bucket(bucketName);
  const objectPath = `generated-videos/${record.uid}/${jobId}.mp4`;
  await bucket.file(objectPath).save(bytes, {
    resumable: false,
    contentType: 'video/mp4',
    metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } }
  });
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function pollJob(user: AuthenticatedUser, jobId: string, res: any) {
  const ref = getFirestore(getAdminApp()).collection(JOB_COLLECTION).doc(jobId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return fail(res, 404, 'VIDEO_JOB_NOT_FOUND', 'Job video non trovato.');
  const record = snapshot.data() as VideoJobRecord;
  if (record.uid !== user.uid) return fail(res, 403, 'VIDEO_JOB_FORBIDDEN', 'Non puoi accedere a questo video.');
  if (record.status === 'COMPLETED' && record.videoUrl) return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl: record.videoUrl });
  if (record.status === 'FAILED') return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: record.error || 'Generazione video fallita.' });

  try {
    const response = await fetch(`${GEMINI_BASE_URL}/${record.operationName}`, { headers: { 'x-goog-api-key': providerApiKey() }, cache: 'no-store' });
    const operation = await response.json() as any;
    if (!response.ok) throw new Error(String(operation?.error?.message || `Video operation HTTP ${response.status}`));
    if (!operation.done) return json(res, 200, { jobId, status: 'PROCESSING', progress: 55, stage: 'SONARA Video AI: rendering cinematografico' });
    if (operation.error) {
      const message = String(operation.error?.message || 'Il provider ha bloccato o interrotto il video.');
      if (!record.refunded) await releaseVideoCredits(user.uid, record.credits, jobId).catch(() => undefined);
      await ref.set({ status: 'FAILED', error: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: message });
    }
    const uri = String(operation?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || operation?.response?.generatedVideos?.[0]?.video?.uri || '');
    if (!uri) throw new Error('Il provider ha completato il job senza restituire il file video.');
    const videoUrl = await persistGeneratedVideo(jobId, record, uri);
    await ref.set({ status: 'COMPLETED', providerVideoUri: uri, videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });
  } catch (cause) {
    return fail(res, 502, 'VIDEO_JOB_POLL_FAILED', cause instanceof Error ? cause.message : 'Controllo video fallito.');
  }
}

export default async function handler(req: any, res: any) {
  const user = await authenticatedUser(req);
  if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per usare Video AI.');
  if (!serviceAccountConfigured()) return fail(res, 503, 'VIDEO_SERVER_NOT_CONFIGURED', 'Firebase Admin non è configurato per Video AI.');
  const action = actionFromRequest(req);
  try {
    if (req.method === 'GET' && action === 'status') return json(res, 200, publicStatus(await billingRecord(user.uid)));
    if (req.method === 'POST' && action === 'generate') return await startVideo(user, req, res);
    if (req.method === 'GET' && action.startsWith('job/')) return await pollJob(user, action.slice(4), res);
    return fail(res, 404, 'VIDEO_ROUTE_NOT_FOUND', 'Rotta SONARA Video AI non trovata.');
  } catch (cause) {
    return fail(res, 500, 'VIDEO_INTERNAL_ERROR', cause instanceof Error ? cause.message : 'Errore interno Video AI.');
  }
}
