import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { SONARA_PLANS, type SonaraPlanId, type SonaraVideoResolution } from '../../../src/billing/plans';
import { persistProviderVideo, pollVideoProvider, startVideoProvider, type SonaraVideoProvider } from '../provider';
import { pollConcatenation, publishTranscodedVideo, startConcatenation } from '../../../src/server/video/transcoder';

const JOB_COLLECTION = 'sonaraVideoJobs';
let adminApp: App | null = null;

type VideoJobRecord = {
  uid: string;
  operationName?: string;
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
  startAttempts?: number;
  pollErrors?: number;
  durationSeconds?: number;
  clipCount?: number;
  operations?: Array<{ operationName: string; model: string; provider: SonaraVideoProvider; clipUri?: string; videoUrl?: string }>;
  transcoderJobName?: string;
  transcoderOutputPath?: string;
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

function fail(res: any, status: number, code: string, message: string) {
  return json(res, status, { error: { code, message } });
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

async function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout dopo ${Math.round(ms / 1000)}s`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function releaseVideoCredits(uid: string, credits: number, jobId: string, app: App) {
  const firestore = getFirestore(app);
  const billingRef = firestore.collection('sonaraBilling').doc(uid);
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(billingRef);
    const record = snapshot.exists ? snapshot.data() as any : {};
    const now = new Date();
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    if (record.videoCreditsPeriodKey === periodKey) {
      transaction.set(billingRef, {
        videoCreditsUsed: Math.max(0, Number(record.videoCreditsUsed || 0) - credits),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    transaction.set(firestore.collection(JOB_COLLECTION).doc(jobId), { refunded: true }, { merge: true });
  });
}

async function failAndRefund(record: VideoJobRecord, jobId: string, ref: FirebaseFirestore.DocumentReference, app: App, message: string) {
  if (!record.refunded) {
    try {
      await within(releaseVideoCredits(record.uid, record.credits, jobId, app), 4_000, 'Rimborso crediti video');
    } catch (cause) {
      console.error('[SONARA VIDEO] refund delayed', { jobId, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  await ref.set({ status: 'FAILED', error: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return message;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');
  try {
    const user = await authenticatedUser(req);
    if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per usare Video AI.');

    const jobId = String(req.query?.id || '').trim();
    if (!jobId) return fail(res, 400, 'VIDEO_JOB_REQUIRED', 'Job video non valido.');

    const app = getAdminApp();
    const ref = getFirestore(app).collection(JOB_COLLECTION).doc(jobId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return fail(res, 404, 'VIDEO_JOB_NOT_FOUND', 'Job video non trovato.');
    const record = snapshot.data() as VideoJobRecord;
    if (record.uid !== user.uid) return fail(res, 403, 'VIDEO_JOB_FORBIDDEN', 'Non puoi accedere a questo video.');

    if (record.status === 'COMPLETED' && record.videoUrl) {
      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl: record.videoUrl });
    }
    if (record.status === 'FAILED') {
      return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: record.error || 'Generazione video fallita.' });
    }

    const durationSeconds = Math.max(8, Number(record.durationSeconds || 8));
    const clipCount = Math.max(1, Number(record.clipCount || Math.ceil(durationSeconds / 8)));

    if (clipCount > 1) {
      const operations = Array.isArray(record.operations) ? [...record.operations] : [];
      if (operations.length < clipCount) {
        const batchSize = Math.min(4, clipCount - operations.length);
        for (let offset = 0; offset < batchSize; offset += 1) {
          const scene = operations.length + 1;
          const result = await within(startVideoProvider({
            app,
            bucketName: storageBucketName(),
            planId: record.planId,
            prompt: `${record.prompt}\n\nScene ${scene} of ${clipCount}. Maintain the same subjects, wardrobe, visual style, lighting and cinematic continuity. Create the next distinct shot in the sequence.`,
            aspectRatio: record.aspectRatio,
            resolution: record.resolution,
            userId: record.uid
          }), 25_000, `Avvio scena ${scene}`);
          operations.push(result);
          await ref.set({ operations, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        const progress = Math.max(6, Math.round((operations.length / clipCount) * 20));
        return json(res, 200, { jobId, status: 'PROCESSING', progress, stage: `SONARA Video AI: avvio scene ${operations.length}/${clipCount}` });
      }

      let completed = 0;
      for (let index = 0; index < operations.length; index += 1) {
        if (operations[index].clipUri) { completed += 1; continue; }
        const operation = await within(pollVideoProvider({
          app,
          provider: operations[index].provider,
          model: operations[index].model,
          operationName: operations[index].operationName
        }), 15_000, `Controllo scena ${index + 1}`);
        if (operation.error) throw new Error(`Scena ${index + 1}: ${operation.error}`);
        if (!operation.done || !operation.uri) continue;
        const clipPath = `generated-videos/staging/${record.uid}/${jobId}/clip-${String(index).padStart(3, '0')}.mp4`;
        const videoUrl = await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, operation.uri, clipPath), 45_000, `Salvataggio scena ${index + 1}`);
        operations[index] = { ...operations[index], clipUri: `gs://${storageBucketName()}/${clipPath}`, videoUrl };
        completed += 1;
      }
      await ref.set({ operations, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (completed < clipCount) {
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 20 + Math.round((completed / clipCount) * 55), stage: `SONARA Video AI: rendering scene ${completed}/${clipCount}` });
      }

      if (!record.transcoderJobName) {
        const concat = await within(startConcatenation(
          app,
          storageBucketName(),
          record.uid,
          jobId,
          operations.map(item => String(item.clipUri)),
          record.resolution,
          record.aspectRatio,
          durationSeconds
        ), 20_000, 'Avvio montaggio video');
        await ref.set({ transcoderJobName: concat.name, transcoderOutputPath: concat.outputPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 82, stage: 'SONARA Video AI: montaggio automatico' });
      }

      const transcoder = await within(pollConcatenation(app, record.transcoderJobName), 15_000, 'Controllo montaggio video');
      if (transcoder.state === 'FAILED') throw new Error(transcoder.error || 'Montaggio video fallito.');
      if (transcoder.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 90, stage: 'SONARA Video AI: finalizzazione MP4' });
      const videoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.transcoderOutputPath));
      await ref.set({ status: 'COMPLETED', videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });
    }

    if (!String(record.operationName || '').trim()) {
      const attempt = Math.max(0, Number(record.startAttempts || 0)) + 1;
      try {
        const started = await within(startVideoProvider({
          app,
          bucketName: storageBucketName(),
          planId: record.planId,
          prompt: record.prompt,
          aspectRatio: record.aspectRatio,
          resolution: record.resolution,
          userId: record.uid
        }), 20_000, 'Avvio provider Video AI');

        await ref.set({
          operationName: started.operationName,
          model: started.model,
          provider: started.provider,
          startAttempts: attempt,
          lastStartError: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.info('[SONARA VIDEO] provider started', { jobId, attempt, provider: started.provider, model: started.model });
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 18, stage: 'SONARA Video AI: motore avviato' });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        console.warn('[SONARA VIDEO] provider start retry', { jobId, attempt, message });
        await ref.set({ startAttempts: attempt, lastStartError: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (attempt < 4) {
          return json(res, 200, { jobId, status: 'PROCESSING', progress: Math.min(15, 4 + attempt * 2), stage: `SONARA Video AI: riconnessione motore (${attempt}/4)` });
        }
        const finalMessage = await failAndRefund(record, jobId, ref, app, `Avvio Video AI non riuscito dopo ${attempt} tentativi: ${message}`);
        return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: finalMessage });
      }
    }

    try {
      const operation = await within(pollVideoProvider({
        app,
        provider: record.provider || 'gemini',
        model: record.model,
        operationName: String(record.operationName)
      }), 15_000, 'Controllo provider Video AI');

      if (!operation.done) {
        if (record.pollErrors) await ref.set({ pollErrors: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 55, stage: 'SONARA Video AI: rendering cinematografico' });
      }
      if (operation.error) {
        const finalMessage = await failAndRefund(record, jobId, ref, app, operation.error);
        return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: finalMessage });
      }

      const uri = String(operation.uri || '');
      const videoUrl = await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri), 45_000, 'Salvataggio video');
      await ref.set({
        status: 'COMPLETED',
        providerVideoUri: uri,
        videoUrl,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const pollErrors = Math.max(0, Number(record.pollErrors || 0)) + 1;
      console.warn('[SONARA VIDEO] poll transient error', { jobId, pollErrors, message });
      await ref.set({ pollErrors, lastPollError: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (pollErrors < 6) {
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 50, stage: `SONARA Video AI: riconnessione rendering (${pollErrors}/6)` });
      }
      const finalMessage = await failAndRefund(record, jobId, ref, app, `Rendering Video AI non raggiungibile: ${message}`);
      return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: finalMessage });
    }
  } catch (cause) {
    console.error('[SONARA VIDEO] job route failure', cause);
    return fail(res, 500, 'VIDEO_INTERNAL_ERROR', cause instanceof Error ? cause.message : 'Errore interno Video AI.');
  }
}
