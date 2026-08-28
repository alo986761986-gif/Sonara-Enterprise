import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { SONARA_PLANS, SONARA_VIDEO_CREDIT_COST, isSonaraVideoResolution, type SonaraPlanId, type SonaraVideoResolution } from '../../src/billing/plans';
import { repairStorageAndGrantStudioCredits } from '../../src/server/video/storageCreditRepair';
import { videoModelForPlan, videoProviderMode, videoProviderReady } from './provider';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const JOB_COLLECTION = 'sonaraVideoJobs';
const STORAGE_CREDIT_REPAIR_TOKEN = 'sonara-storage-credit-repair-20260828';
let adminApp: App | null = null;

type BillingRecord = {
  planId?: SonaraPlanId;
  subscriptionStatus?: string;
  usagePeriodEnd?: Timestamp;
  videoCreditsUsed?: number;
  videoCreditsPeriodKey?: string;
  videoCreditsPerMonthOverride?: number;
};

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

async function authenticatedUser(req: any) {
  const token = bearerToken(req);
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!token || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string; email?: string }> };
    const user = payload.users?.[0];
    return user?.localId ? { uid: user.localId, email: user.email } : null;
  } catch {
    return null;
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

function publicStatus(record: BillingRecord | undefined, app: App) {
  const planId = effectivePlan(record);
  const plan = SONARA_PLANS[planId];
  const periodKey = currentPeriodKey();
  const used = record?.videoCreditsPeriodKey === periodKey ? Math.max(0, Number(record.videoCreditsUsed || 0)) : 0;
  const allowance = creditAllowance(record, planId);
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

async function reserveVideoCredits(uid: string, resolution: SonaraVideoResolution, durationSeconds: number, app: App) {
  const firestore = getFirestore(app);
  const ref = firestore.collection('sonaraBilling').doc(uid);
  let result!: { planId: SonaraPlanId; credits: number; status: ReturnType<typeof publicStatus> };
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const record = snapshot.exists ? snapshot.data() as BillingRecord : {};
    const planId = effectivePlan(record);
    const plan = SONARA_PLANS[planId];
    if (!plan.videoResolutions.includes(resolution)) throw Object.assign(new Error('VIDEO_RESOLUTION_NOT_ALLOWED'), { allowed: plan.videoResolutions });
    if (durationSeconds > plan.videoClipSeconds || (durationSeconds > 8 && planId !== 'studio')) {
      throw Object.assign(new Error('VIDEO_DURATION_NOT_ALLOWED'), { maxDurationSeconds: plan.videoClipSeconds });
    }
    const credits = Math.ceil(durationSeconds / 8) * SONARA_VIDEO_CREDIT_COST[resolution];
    const periodKey = currentPeriodKey();
    const used = record.videoCreditsPeriodKey === periodKey ? Math.max(0, Number(record.videoCreditsUsed || 0)) : 0;
    const allowance = creditAllowance(record, planId);
    if (used + credits > allowance) throw Object.assign(new Error('VIDEO_CREDITS_EXHAUSTED'), { creditsRemaining: Math.max(0, allowance - used) });
    const next: BillingRecord = { ...record, videoCreditsPeriodKey: periodKey, videoCreditsUsed: used + credits };
    transaction.set(ref, { videoCreditsPeriodKey: periodKey, videoCreditsUsed: used + credits, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    result = { planId, credits, status: publicStatus(next, app) };
  });
  return result;
}

export default async function handler(req: any, res: any) {
  if (
    req.method === 'GET' &&
    String(req.query?.repairStorageCredits || '') === STORAGE_CREDIT_REPAIR_TOKEN &&
    String(process.env.VERCEL_ENV || '') === 'production'
  ) {
    try {
      const result = await repairStorageAndGrantStudioCredits(
        getAdminApp(),
        storageBucketName(),
        String(req.query?.jobId || '').trim()
      );
      return json(res, 200, result as Record<string, unknown>);
    } catch (cause) {
      return fail(res, 500, 'STORAGE_CREDIT_REPAIR_FAILED', cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');
  try {
    const user = await authenticatedUser(req);
    if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per usare Video AI.');
    const app = getAdminApp();
    const bucketName = storageBucketName();
    if (!videoProviderReady(app, bucketName)) return fail(res, 503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Il motore SONARA Video AI non è ancora configurato sul server.');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const prompt = String(body.prompt || '').trim();
    const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : '16:9';
    const resolution = body.resolution;
    const requestedDuration = Number(body.durationSeconds || 8);
    const durationSeconds = Number.isFinite(requestedDuration) ? Math.max(8, Math.min(120, Math.round(requestedDuration))) : 8;
    if (prompt.length < 8) return fail(res, 400, 'VIDEO_PROMPT_REQUIRED', 'Descrivi il video con un prompt più completo.');
    if (prompt.length > 5000) return fail(res, 400, 'VIDEO_PROMPT_TOO_LONG', 'Il prompt video è troppo lungo.');
    if (!isSonaraVideoResolution(resolution)) return fail(res, 400, 'INVALID_VIDEO_RESOLUTION', 'Risoluzione video non valida.');

    let reservation: Awaited<ReturnType<typeof reserveVideoCredits>>;
    try {
      reservation = await reserveVideoCredits(user.uid, resolution, durationSeconds, app);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'VIDEO_BILLING_ERROR';
      if (code === 'VIDEO_RESOLUTION_NOT_ALLOWED') return fail(res, 403, code, 'Questa qualità video non è inclusa nel piano attivo.', { allowed: (cause as any).allowed });
      if (code === 'VIDEO_DURATION_NOT_ALLOWED') return fail(res, 403, code, 'I video oltre 8 secondi sono disponibili esclusivamente con SONARA Studio.', { maxDurationSeconds: (cause as any).maxDurationSeconds });
      if (code === 'VIDEO_CREDITS_EXHAUSTED') return fail(res, 402, code, 'Hai terminato i crediti Video AI del mese.', { creditsRemaining: (cause as any).creditsRemaining });
      return fail(res, 503, 'VIDEO_BILLING_ERROR', 'Il controllo dei crediti video non è disponibile.');
    }

    const provider = videoProviderMode(app, bucketName)!;
    const model = videoModelForPlan(reservation.planId, provider);
    const jobRef = getFirestore(app).collection(JOB_COLLECTION).doc();
    await jobRef.set({
      uid: user.uid,
      operationName: '',
      prompt,
      aspectRatio,
      resolution,
      durationSeconds,
      clipCount: Math.ceil(durationSeconds / 8),
      operations: [],
      credits: reservation.credits,
      planId: reservation.planId,
      model,
      provider,
      status: 'PROCESSING',
      startAttempts: 0,
      pollErrors: 0,
      refunded: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    console.info('[SONARA VIDEO] job accepted', { jobId: jobRef.id, provider, model, resolution, aspectRatio, durationSeconds });
    return json(res, 202, {
      jobId: jobRef.id,
      status: 'PROCESSING',
      progress: 3,
      stage: 'SONARA Video AI: job accettato',
      provider,
      billing: reservation.status
    });
  } catch (cause) {
    console.error('[SONARA VIDEO] generate route failure', cause);
    return fail(res, 500, 'VIDEO_INTERNAL_ERROR', cause instanceof Error ? cause.message : 'Errore interno Video AI.');
  }
}
