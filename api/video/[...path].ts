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
import {
  persistProviderVideo,
  pollVideoProvider,
  startVideoProvider,
  videoProviderMode,
  videoProviderReady,
  type SonaraVideoProvider
} from './provider';
import {
  authenticatedVideoUser,
  trustedVideoBillingRecord,
  type AuthenticatedVideoUser
} from '../../src/server/video/auth';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const JOB_COLLECTION = 'sonaraVideoJobs';

type MediaKind = 'image' | 'video' | 'audio';
interface BillingRecord {
  planId?: SonaraPlanId;
  subscriptionStatus?: string;
  usagePeriodEnd?: Timestamp;
  videoCreditsUsed?: number;
  videoCreditsPeriodKey?: string;
  videoCreditsPerMonthOverride?: number;
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
  provider: SonaraVideoProvider;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  providerVideoUri?: string;
  error?: string;
  refunded?: boolean;
}

let adminApp: App | null = null;
let storageCorsReady = false;
let storageCorsPromise: Promise<void> | null = null;

async function ensureStorageCors(bucket: any) {
  if (storageCorsReady) return;
  if (!storageCorsPromise) {
    storageCorsPromise = (async () => {
      await bucket.setCorsConfiguration([{
        origin: [
          'https://sonaraenterprise.com',
          'https://www.sonaraenterprise.com',
          'https://sonara-enterprise-git-main-sonaramusicai86-2765s-projects.vercel.app',
          'http://localhost:3000',
          'http://127.0.0.1:3000'
        ],
        method: ['GET', 'HEAD', 'PUT'],
        responseHeader: ['Content-Type', 'ETag', 'x-goog-hash', 'x-goog-generation', 'x-goog-metageneration'],
        maxAgeSeconds: 3600
      }]);
      storageCorsReady = true;
      console.info('[SONARA VIDEO UPLOAD] storage CORS configured');
    })().catch(cause => {
      storageCorsPromise = null;
      console.error('[SONARA VIDEO UPLOAD] storage CORS configuration failed', cause);
      throw cause;
    });
  }
  await storageCorsPromise;
}

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

function actionFromRequest(req: any) {
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (queryPath) return queryPath.replace(/^\/+|\/+$/g, '').toLowerCase();
  const pathname = String(req.url || '').split(/[?#]/, 1)[0];
  return String(pathname.match(/\/api\/video(?:\/(.*))?\/?$/i)?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function safeFileName(value: string) {
  const clean = String(value || 'media')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean.slice(0, 100) || 'media';
}

function mediaKind(value: unknown): MediaKind | null {
  return value === 'image' || value === 'video' || value === 'audio' ? value : null;
}

function validContentType(kind: MediaKind, contentType: string) {
  const normalized = String(contentType || '').toLowerCase();
  if (kind === 'image') return normalized.startsWith('image/');
  if (kind === 'video') return normalized.startsWith('video/');
  return normalized.startsWith('audio/') || normalized === 'application/ogg';
}

function maxBytes(kind: MediaKind) {
  if (kind === 'image') return 25 * 1024 * 1024;
  if (kind === 'video') return 300 * 1024 * 1024;
  return 250 * 1024 * 1024;
}

async function prepareMediaUpload(user: AuthenticatedVideoUser, req: any, res: any) {
  const bucketName = storageBucketName();
  if (!bucketName) {
    return fail(res, 503, 'VIDEO_UPLOAD_NOT_CONFIGURED', 'Firebase Admin Storage non è configurato sul server SONARA.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const kind = mediaKind(body.kind);
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const size = Math.max(0, Number(body.size || 0));
  const fileName = safeFileName(String(body.fileName || 'media'));

  if (!kind) return fail(res, 400, 'INVALID_MEDIA_KIND', 'Tipo di media non valido.');
  if (!validContentType(kind, contentType)) return fail(res, 400, 'INVALID_MEDIA_TYPE', 'Formato del file non valido per SONARA Video AI.');
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes(kind)) {
    return fail(res, 413, 'MEDIA_TOO_LARGE', 'Il file supera il limite consentito per SONARA Video AI.');
  }

  try {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `video-ai-inputs/${user.uid}/${Date.now()}-${randomPart}-${fileName}`;
    const bucket = getStorage(getAdminApp()).bucket(bucketName);
    await ensureStorageCors(bucket);
    const file = bucket.file(storagePath);
    const expiresWrite = Date.now() + 15 * 60 * 1000;
    const expiresRead = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresWrite,
      contentType
    });
    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresRead
    });

    return json(res, 200, {
      storagePath,
      uploadUrl,
      downloadUrl,
      contentType,
      size,
      kind,
      expiresAt: expiresWrite
    });
  } catch (cause) {
    console.error('[SONARA VIDEO UPLOAD] signed upload creation failed', cause);
    return fail(res, 502, 'VIDEO_UPLOAD_PREPARE_FAILED', cause instanceof Error ? cause.message : 'Preparazione upload fallita.');
  }
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

function creditAllowance(record: BillingRecord | undefined, planId: SonaraPlanId) {
  const base = SONARA_PLANS[planId].videoCreditsPerMonth;
  const override = Math.max(0, Number(record?.videoCreditsPerMonthOverride || 0));
  return Math.max(base, override);
}

async function billingRecord(user: AuthenticatedVideoUser): Promise<BillingRecord | undefined> {
  const snapshot = await getFirestore(getAdminApp()).collection('sonaraBilling').doc(user.uid).get();
  const stored = snapshot.exists ? snapshot.data() as BillingRecord : {};
  return trustedVideoBillingRecord(user, stored);
}

function publicStatus(record: BillingRecord | undefined) {
  const planId = effectivePlan(record);
  const plan = SONARA_PLANS[planId];
  const periodKey = currentPeriodKey();
  const used = record?.videoCreditsPeriodKey === periodKey ? Math.max(0, Number(record.videoCreditsUsed || 0)) : 0;
  const allowance = creditAllowance(record, planId);
  const app = getAdminApp();
  const bucket = storageBucketName();
  return {
    planId,
    planName: plan.name,
    videoCreditsPerMonth: allowance,
    videoCreditsUsed: used,
    videoCreditsRemaining: Math.max(0, allowance - used),
    videoClipSeconds: plan.videoClipSeconds,
    videoResolutions: plan.videoResolutions,
    providerConfigured: videoProviderReady(app, bucket),
    provider: videoProviderMode(app, bucket)
  };
}

async function reserveVideoCredits(user: AuthenticatedVideoUser, resolution: SonaraVideoResolution) {
  const firestore = getFirestore(getAdminApp());
  const ref = firestore.collection('sonaraBilling').doc(user.uid);
  let result!: { planId: SonaraPlanId; credits: number; status: ReturnType<typeof publicStatus> };
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists ? snapshot.data() as BillingRecord : {};
    const record = trustedVideoBillingRecord(user, stored);
    const planId = effectivePlan(record);
    const plan = SONARA_PLANS[planId];
    if (!plan.videoResolutions.includes(resolution)) throw Object.assign(new Error('VIDEO_RESOLUTION_NOT_ALLOWED'), { planId, allowed: plan.videoResolutions });
    const credits = SONARA_VIDEO_CREDIT_COST[resolution];
    const periodKey = currentPeriodKey();
    const used = record.videoCreditsPeriodKey === periodKey ? Math.max(0, Number(record.videoCreditsUsed || 0)) : 0;
    const allowance = creditAllowance(record, planId);
    if (used + credits > allowance) throw Object.assign(new Error('VIDEO_CREDITS_EXHAUSTED'), { planId, creditsRemaining: Math.max(0, allowance - used) });
    const next: BillingRecord = { ...record, videoCreditsPeriodKey: periodKey, videoCreditsUsed: used + credits };
    transaction.set(ref, {
      ...(user.native ? {
        planId: record.planId,
        subscriptionStatus: record.subscriptionStatus,
        videoCreditsPerMonthOverride: record.videoCreditsPerMonthOverride
      } : {}),
      videoCreditsPeriodKey: periodKey,
      videoCreditsUsed: used + credits,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
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

async function startVideo(user: AuthenticatedVideoUser, req: any, res: any) {
  const app = getAdminApp();
  const bucketName = storageBucketName();
  if (!videoProviderReady(app, bucketName)) return fail(res, 503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Il motore SONARA Video AI non è ancora configurato sul server.');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = String(body.prompt || '').trim();
  const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = body.resolution;
  if (prompt.length < 8) return fail(res, 400, 'VIDEO_PROMPT_REQUIRED', 'Descrivi il video con un prompt più completo.');
  if (prompt.length > 5000) return fail(res, 400, 'VIDEO_PROMPT_TOO_LONG', 'Il prompt video è troppo lungo.');
  if (!isSonaraVideoResolution(resolution)) return fail(res, 400, 'INVALID_VIDEO_RESOLUTION', 'Risoluzione video non valida.');

  let reservation: Awaited<ReturnType<typeof reserveVideoCredits>>;
  try { reservation = await reserveVideoCredits(user, resolution); }
  catch (cause) {
    const code = cause instanceof Error ? cause.message : 'VIDEO_BILLING_ERROR';
    if (code === 'VIDEO_RESOLUTION_NOT_ALLOWED') return fail(res, 403, code, 'Questa qualità video non è inclusa nel piano attivo.', { allowed: (cause as any).allowed });
    if (code === 'VIDEO_CREDITS_EXHAUSTED') return fail(res, 402, code, 'Hai terminato i crediti Video AI del mese.', { creditsRemaining: (cause as any).creditsRemaining });
    return fail(res, 503, 'VIDEO_BILLING_ERROR', 'Il controllo dei crediti video non è disponibile.');
  }

  try {
    const providerJob = await startVideoProvider({
      app,
      bucketName,
      planId: reservation.planId,
      prompt,
      aspectRatio,
      resolution,
      userId: user.uid
    });
    const jobRef = getFirestore(app).collection(JOB_COLLECTION).doc();
    await jobRef.set({
      uid: user.uid,
      operationName: providerJob.operationName,
      prompt,
      aspectRatio,
      resolution,
      credits: reservation.credits,
      planId: reservation.planId,
      model: providerJob.model,
      provider: providerJob.provider,
      status: 'PROCESSING',
      refunded: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return json(res, 202, {
      jobId: jobRef.id,
      status: 'PROCESSING',
      progress: 5,
      stage: 'SONARA Video AI: rendering avviato',
      provider: providerJob.provider,
      billing: reservation.status
    });
  } catch (cause) {
    await releaseVideoCredits(user.uid, reservation.credits).catch(() => undefined);
    return fail(res, 502, 'VIDEO_PROVIDER_START_FAILED', cause instanceof Error ? cause.message : 'Avvio generazione video fallito.');
  }
}

async function pollJob(user: AuthenticatedVideoUser, jobId: string, res: any) {
  const app = getAdminApp();
  const ref = getFirestore(app).collection(JOB_COLLECTION).doc(jobId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return fail(res, 404, 'VIDEO_JOB_NOT_FOUND', 'Job video non trovato.');
  const record = snapshot.data() as VideoJobRecord;
  if (record.uid !== user.uid) return fail(res, 403, 'VIDEO_JOB_FORBIDDEN', 'Non puoi accedere a questo video.');
  if (record.status === 'COMPLETED' && record.videoUrl) return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl: record.videoUrl });
  if (record.status === 'FAILED') return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: record.error || 'Generazione video fallita.' });

  try {
    const operation = await pollVideoProvider({
      app,
      provider: record.provider || 'gemini',
      model: record.model,
      operationName: record.operationName
    });
    if (!operation.done) return json(res, 200, { jobId, status: 'PROCESSING', progress: 55, stage: 'SONARA Video AI: rendering cinematografico' });
    if (operation.error) {
      if (!record.refunded) await releaseVideoCredits(user.uid, record.credits, jobId).catch(() => undefined);
      await ref.set({ status: 'FAILED', error: operation.error, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: operation.error });
    }
    const uri = String(operation.uri || '');
    const videoUrl = await persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri);
    await ref.set({ status: 'COMPLETED', providerVideoUri: uri, videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });
  } catch (cause) {
    return fail(res, 502, 'VIDEO_JOB_POLL_FAILED', cause instanceof Error ? cause.message : 'Controllo video fallito.');
  }
}

export default async function handler(req: any, res: any) {
  const user = await authenticatedVideoUser(req);
  if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per usare Video AI.');
  if (!serviceAccountConfigured()) return fail(res, 503, 'VIDEO_SERVER_NOT_CONFIGURED', 'Firebase Admin non è configurato per Video AI.');
  const action = actionFromRequest(req);
  try {
    if (req.method === 'POST' && action === 'upload') return await prepareMediaUpload(user, req, res);
    if (req.method === 'GET' && action === 'status') return json(res, 200, publicStatus(await billingRecord(user)));
    if (req.method === 'POST' && action === 'generate') return await startVideo(user, req, res);
    if (req.method === 'GET' && action.startsWith('job/')) return await pollJob(user, action.slice(4), res);
    return fail(res, 404, 'VIDEO_ROUTE_NOT_FOUND', 'Rotta SONARA Video AI non trovata.');
  } catch (cause) {
    return fail(res, 500, 'VIDEO_INTERNAL_ERROR', cause instanceof Error ? cause.message : 'Errore interno Video AI.');
  }
}
