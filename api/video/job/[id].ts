import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { SONARA_PLANS, type SonaraPlanId, type SonaraVideoResolution } from '../../../src/billing/plans';
import { persistProviderVideo, pollVideoProvider, startVideoProvider, type SonaraVideoProvider } from '../provider';
import { buildVeoSafetyRetryPrompt, isVeoSafetyFilterError, veoNegativePrompt, veoSafetyCategory } from '../../../src/server/video/safety';
import { pollConcatenation, publishTranscodedVideo, startConcatenation, startSoundtrackMux } from '../../../src/server/video/transcoder';
import { authenticatedVideoUser } from '../auth';

const JOB_COLLECTION = 'sonaraVideoJobs';
const MAX_SCENE_RETRIES = 3;
const MAX_SINGLE_CLIP_SAFETY_RETRIES = 3;
const SCENE_START_CONCURRENCY = 4;
let adminApp: App | null = null;

type SceneOperation = {
  operationName: string;
  model: string;
  provider: SonaraVideoProvider;
  clipUri?: string;
  videoUrl?: string;
  retryCount?: number;
  lastError?: string;
  safetyCategory?: string;
};

type MediaReference = {
  storagePath: string;
  contentType?: string;
  sourceKind?: 'image' | 'video' | 'audio';
  sourceName?: string;
  size?: number;
  originalStoragePath?: string;
};

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
  safetyRetryCount?: number;
  lastSafetyError?: string;
  durationSeconds?: number;
  clipCount?: number;
  operations?: SceneOperation[];
  transcoderJobName?: string;
  transcoderOutputPath?: string;
  soundtrackJobName?: string;
  soundtrackOutputPath?: string;
  singleClipUri?: string;
  mediaReferences?: MediaReference[];
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

function firestoreSafeOperations(operations: SceneOperation[]): SceneOperation[] {
  return operations.map(operation => Object.fromEntries(
    Object.entries(operation).filter(([, value]) => value !== undefined)
  ) as SceneOperation);
}

function referenceImages(record: VideoJobRecord) {
  return (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])
    .filter(item => item && typeof item.storagePath === 'string' && item.storagePath.trim() && String(item.contentType || 'image/jpeg').toLowerCase().startsWith('image/'))
    .slice(0, 3)
    .map(item => ({ storagePath: item.storagePath.trim(), contentType: String(item.contentType || 'image/jpeg') }));
}

function sourceVideoUris(record: VideoJobRecord) {
  const bucket = storageBucketName();
  return (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])
    .filter(item => item?.sourceKind === 'video' && typeof item.originalStoragePath === 'string' && item.originalStoragePath.trim())
    .map(item => `gs://${bucket}/${String(item.originalStoragePath).trim()}`)
    .slice(0, 6);
}

function soundtrackUri(record: VideoJobRecord) {
  const bucket = storageBucketName();
  const audio = (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])
    .find(item => item?.sourceKind === 'audio' && typeof item.storagePath === 'string' && item.storagePath.trim());
  return audio ? `gs://${bucket}/${String(audio.storagePath).trim()}` : '';
}

async function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout dopo ${Math.round(ms / 1000)}s`)), ms); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function releaseVideoCredits(uid: string, credits: number, jobId: string, app: App) {
  const firestore = getFirestore(app);
  const billingRef = firestore.collection('sonaraBilling').doc(uid);
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(billingRef);
    const record = snapshot.exists ? snapshot.data() as any : {};
    const now = new Date();
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    if (record.videoCreditsPeriodKey === periodKey) transaction.set(billingRef, { videoCreditsUsed: Math.max(0, Number(record.videoCreditsUsed || 0) - credits), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(firestore.collection(JOB_COLLECTION).doc(jobId), { refunded: true }, { merge: true });
  });
}

async function failAndRefund(record: VideoJobRecord, jobId: string, ref: FirebaseFirestore.DocumentReference, app: App, message: string) {
  if (!record.refunded) {
    try { await within(releaseVideoCredits(record.uid, record.credits, jobId, app), 4_000, 'Rimborso crediti video'); }
    catch (cause) { console.error('[SONARA VIDEO] refund delayed', { jobId, error: cause instanceof Error ? cause.message : String(cause) }); }
  }
  await ref.set({ status: 'FAILED', error: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return message;
}

function scenePrompt(record: VideoJobRecord, scene: number, clipCount: number, retryCount = 0) {
  const retryInstruction = retryCount > 0
    ? ` This is regeneration attempt ${retryCount}. Keep the scene safe, non-graphic, visually simple and unambiguous while preserving continuity. Use only original fictional identities and do not create a recognizable real-person or celebrity likeness.`
    : '';
  const mediaInstruction = referenceImages(record).length
    ? ' Use the attached SONARA media references as the authoritative visual source for subject identity, wardrobe, environment, color language and composition continuity.'
    : '';
  return `${record.prompt}\n\nScene ${scene} of ${clipCount}. Maintain the same subjects, wardrobe, visual style, lighting and cinematic continuity. Create the next distinct shot in the sequence.${mediaInstruction}${retryInstruction}`;
}

async function restartScene(app: App, record: VideoJobRecord, sceneIndex: number, clipCount: number, previous: SceneOperation) {
  const retryCount = Math.max(0, Number(previous.retryCount || 0)) + 1;
  if (retryCount > MAX_SCENE_RETRIES) throw new Error(`Scena ${sceneIndex + 1}: ${previous.lastError || 'generazione fallita'} dopo ${MAX_SCENE_RETRIES} tentativi automatici.`);

  const safetyFiltered = isVeoSafetyFilterError(previous.lastError);
  const prompt = safetyFiltered
    ? buildVeoSafetyRetryPrompt(record.prompt, previous.lastError, retryCount, { scene: sceneIndex + 1, clipCount, aspectRatio: record.aspectRatio })
    : scenePrompt(record, sceneIndex + 1, clipCount, retryCount);
  const restarted = await within(startVideoProvider({
    app,
    bucketName: storageBucketName(),
    planId: record.planId,
    prompt,
    ...(safetyFiltered ? { negativePrompt: veoNegativePrompt(previous.lastError) } : {}),
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    userId: record.uid,
    referenceImages: referenceImages(record)
  }), 25_000, `Riavvio scena ${sceneIndex + 1}`);
  return {
    ...restarted,
    retryCount,
    lastError: previous.lastError,
    ...(safetyFiltered ? { safetyCategory: veoSafetyCategory(previous.lastError) || 'other' } : {})
  } as SceneOperation;
}

async function restartSingleClipAfterSafetyFilter(app: App, record: VideoJobRecord, error: string) {
  const retryCount = Math.max(0, Number(record.safetyRetryCount || 0)) + 1;
  if (retryCount > MAX_SINGLE_CLIP_SAFETY_RETRIES) return null;
  const restarted = await within(startVideoProvider({
    app,
    bucketName: storageBucketName(),
    planId: record.planId,
    prompt: buildVeoSafetyRetryPrompt(record.prompt, error, retryCount, { scene: 1, clipCount: 1, aspectRatio: record.aspectRatio }),
    negativePrompt: veoNegativePrompt(error),
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    userId: record.uid,
    referenceImages: referenceImages(record)
  }), 25_000, `Rigenerazione sicura clip (${retryCount}/${MAX_SINGLE_CLIP_SAFETY_RETRIES})`);
  return { ...restarted, retryCount };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');
  try {
    const user = await authenticatedVideoUser(req);
    if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per usare Video AI.');
    const jobId = String(req.query?.id || '').trim();
    if (!jobId) return fail(res, 400, 'VIDEO_JOB_REQUIRED', 'Job video non valido.');

    const app = getAdminApp();
    const ref = getFirestore(app).collection(JOB_COLLECTION).doc(jobId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return fail(res, 404, 'VIDEO_JOB_NOT_FOUND', 'Job video non trovato.');
    const record = snapshot.data() as VideoJobRecord;
    if (record.uid !== user.uid) return fail(res, 403, 'VIDEO_JOB_FORBIDDEN', 'Non puoi accedere a questo video.');
    if (record.status === 'COMPLETED' && record.videoUrl) return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl: record.videoUrl });
    if (record.status === 'FAILED') return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: record.error || 'Generazione video fallita.' });

    const durationSeconds = Math.max(8, Number(record.durationSeconds || 8));
    const clipCount = Math.max(1, Number(record.clipCount || Math.ceil(durationSeconds / 8)));

    if (clipCount > 1) {
      const operations = Array.isArray(record.operations) ? [...record.operations] : [];
      if (operations.length < clipCount) {
        const batchStart = operations.length;
        const batchSize = Math.min(SCENE_START_CONCURRENCY, clipCount - batchStart);
        const startedBatch = await Promise.all(Array.from({ length: batchSize }, async (_, offset) => {
          const scene = batchStart + offset + 1;
          const result = await within(startVideoProvider({
            app,
            bucketName: storageBucketName(),
            planId: record.planId,
            prompt: scenePrompt(record, scene, clipCount),
            aspectRatio: record.aspectRatio,
            resolution: record.resolution,
            userId: record.uid,
            referenceImages: referenceImages(record)
          }), 25_000, `Avvio scena ${scene}`);
          return { ...result, retryCount: 0 } as SceneOperation;
        }));
        operations.push(...startedBatch);
        await ref.set({ operations: firestoreSafeOperations(operations), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        const progress = Math.max(6, Math.round((operations.length / clipCount) * 20));
        return json(res, 200, { jobId, status: 'PROCESSING', progress, stage: `SONARA Video AI: avvio parallelo scene ${operations.length}/${clipCount}` });
      }

      let completed = 0;
      for (let index = 0; index < operations.length; index += 1) {
        if (operations[index].clipUri) { completed += 1; continue; }
        const operation = await within(pollVideoProvider({ app, provider: operations[index].provider, model: operations[index].model, operationName: operations[index].operationName }), 15_000, `Controllo scena ${index + 1}`);
        if (operation.error) {
          const previous = { ...operations[index], lastError: operation.error };
          try {
            operations[index] = await restartScene(app, record, index, clipCount, previous);
            await ref.set({ operations: firestoreSafeOperations(operations), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            const filtered = isVeoSafetyFilterError(operation.error);
            console.warn('[SONARA VIDEO] scene regenerated', { jobId, scene: index + 1, retryCount: operations[index].retryCount, safetyCategory: filtered ? veoSafetyCategory(operation.error) : undefined, reason: operation.error });
            return json(res, 200, {
              jobId,
              status: 'PROCESSING',
              progress: 20 + Math.round((completed / clipCount) * 55),
              stage: filtered
                ? `SONARA Video AI: riformulazione sicura scena ${index + 1}/${clipCount}`
                : `SONARA Video AI: rigenerazione scena ${index + 1}/${clipCount}`
            });
          } catch (retryError) {
            throw new Error(retryError instanceof Error ? retryError.message : String(retryError));
          }
        }
        if (!operation.done || !operation.uri) continue;
        const clipPath = `generated-videos/staging/${record.uid}/${jobId}/clip-${String(index).padStart(3, '0')}.mp4`;
        const videoUrl = await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, operation.uri, clipPath), 45_000, `Salvataggio scena ${index + 1}`);
        const { lastError: _lastError, ...completedOperation } = operations[index];
        operations[index] = { ...completedOperation, clipUri: `gs://${storageBucketName()}/${clipPath}`, videoUrl };
        completed += 1;
      }
      await ref.set({ operations: firestoreSafeOperations(operations), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (completed < clipCount) return json(res, 200, { jobId, status: 'PROCESSING', progress: 20 + Math.round((completed / clipCount) * 55), stage: `SONARA Video AI: rendering scene ${completed}/${clipCount}` });

      if (!record.transcoderJobName) {
        const uploadedVideos = sourceVideoUris(record);
        const soundtrack = soundtrackUri(record);
        const concat = await within(startConcatenation(app, storageBucketName(), record.uid, jobId, operations.map(item => String(item.clipUri)), record.resolution, record.aspectRatio, durationSeconds, uploadedVideos, Boolean(soundtrack) || uploadedVideos.length > 0), 20_000, 'Avvio montaggio video');
        await ref.set({ transcoderJobName: concat.name, transcoderOutputPath: concat.outputPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 82, stage: 'SONARA Video AI: montaggio automatico' });
      }

      const transcoder = await within(pollConcatenation(app, record.transcoderJobName), 15_000, 'Controllo montaggio video');
      if (transcoder.state === 'FAILED') throw new Error(transcoder.error || 'Montaggio video fallito.');
      if (transcoder.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 90, stage: 'SONARA Video AI: finalizzazione MP4' });
      const soundtrack = soundtrackUri(record);
      if (soundtrack) {
        if (!record.soundtrackJobName) {
          const mixed = await within(startSoundtrackMux(
            app, storageBucketName(), record.uid, jobId,
            `gs://${storageBucketName()}/${String(record.transcoderOutputPath)}`, soundtrack,
            record.resolution, record.aspectRatio, durationSeconds
          ), 20_000, 'Avvio soundtrack Video AI');
          await ref.set({ soundtrackJobName: mixed.name, soundtrackOutputPath: mixed.outputPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return json(res, 200, { jobId, status: 'PROCESSING', progress: 95, stage: 'SONARA Video AI: applicazione audio caricato' });
        }
        const mixed = await within(pollConcatenation(app, record.soundtrackJobName), 15_000, 'Controllo soundtrack Video AI');
        if (mixed.state === 'FAILED') throw new Error(mixed.error || 'Applicazione audio fallita.');
        if (mixed.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 97, stage: 'SONARA Video AI: mix audio/video' });
        const mixedVideoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.soundtrackOutputPath));
        await ref.set({ status: 'COMPLETED', videoUrl: mixedVideoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto con media caricati', videoUrl: mixedVideoUrl });
      }
      const videoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.transcoderOutputPath));
      await ref.set({ status: 'COMPLETED', videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: sourceVideoUris(record).length ? 'Video pronto con clip caricate' : 'Video pronto', videoUrl });
    }

    if (record.transcoderJobName) {
      const transcoder = await within(pollConcatenation(app, record.transcoderJobName), 15_000, 'Controllo montaggio media Video AI');
      if (transcoder.state === 'FAILED') throw new Error(transcoder.error || 'Montaggio media Video AI fallito.');
      if (transcoder.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 88, stage: 'SONARA Video AI: composizione media caricati' });

      const soundtrack = soundtrackUri(record);
      if (soundtrack) {
        if (!record.soundtrackJobName) {
          const mixed = await within(startSoundtrackMux(
            app, storageBucketName(), record.uid, jobId,
            `gs://${storageBucketName()}/${String(record.transcoderOutputPath)}`, soundtrack,
            record.resolution, record.aspectRatio, durationSeconds
          ), 20_000, 'Avvio soundtrack Video AI');
          await ref.set({ soundtrackJobName: mixed.name, soundtrackOutputPath: mixed.outputPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return json(res, 200, { jobId, status: 'PROCESSING', progress: 95, stage: 'SONARA Video AI: applicazione audio caricato' });
        }
        const mixed = await within(pollConcatenation(app, record.soundtrackJobName), 15_000, 'Controllo soundtrack Video AI');
        if (mixed.state === 'FAILED') throw new Error(mixed.error || 'Applicazione audio fallita.');
        if (mixed.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 97, stage: 'SONARA Video AI: mix audio/video' });
        const mixedVideoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.soundtrackOutputPath));
        await ref.set({ status: 'COMPLETED', videoUrl: mixedVideoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto con media caricati', videoUrl: mixedVideoUrl });
      }

      const composedVideoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.transcoderOutputPath));
      await ref.set({ status: 'COMPLETED', videoUrl: composedVideoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto con media caricati', videoUrl: composedVideoUrl });
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
          userId: record.uid,
          referenceImages: referenceImages(record)
        }), 20_000, 'Avvio provider Video AI');
        await ref.set({ operationName: started.operationName, model: started.model, provider: started.provider, startAttempts: attempt, lastStartError: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 18, stage: referenceImages(record).length ? 'SONARA Video AI: riferimenti caricati, motore avviato' : 'SONARA Video AI: motore avviato' });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        await ref.set({ startAttempts: attempt, lastStartError: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (attempt < 4) return json(res, 200, { jobId, status: 'PROCESSING', progress: Math.min(15, 4 + attempt * 2), stage: `SONARA Video AI: riconnessione motore (${attempt}/4)` });
        const finalMessage = await failAndRefund(record, jobId, ref, app, `Avvio Video AI non riuscito dopo ${attempt} tentativi: ${message}`);
        return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: finalMessage });
      }
    }

    try {
      const operation = await within(pollVideoProvider({ app, provider: record.provider || 'gemini', model: record.model, operationName: String(record.operationName) }), 15_000, 'Controllo provider Video AI');
      if (!operation.done) return json(res, 200, { jobId, status: 'PROCESSING', progress: 55, stage: 'SONARA Video AI: rendering cinematografico' });
      if (operation.error) {
        if (isVeoSafetyFilterError(operation.error)) {
          const restarted = await restartSingleClipAfterSafetyFilter(app, record, operation.error);
          if (restarted) {
            await ref.set({
              operationName: restarted.operationName,
              model: restarted.model,
              provider: restarted.provider,
              safetyRetryCount: restarted.retryCount,
              lastSafetyError: operation.error,
              pollErrors: 0,
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            console.warn('[SONARA VIDEO] single clip safety regeneration', { jobId, retryCount: restarted.retryCount, category: veoSafetyCategory(operation.error), reason: operation.error });
            return json(res, 200, { jobId, status: 'PROCESSING', progress: 35, stage: `SONARA Video AI: riformulazione sicura (${restarted.retryCount}/${MAX_SINGLE_CLIP_SAFETY_RETRIES})` });
          }
        }
        const finalMessage = await failAndRefund(record, jobId, ref, app, operation.error);
        return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: finalMessage });
      }
      const uri = String(operation.uri || '');
      const uploadedVideos = sourceVideoUris(record);
      const soundtrack = soundtrackUri(record);
      if (uploadedVideos.length || soundtrack) {
        const clipPath = `generated-videos/staging/${record.uid}/${jobId}/single-generated.mp4`;
        await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri, clipPath), 45_000, 'Salvataggio clip AI');
        const clipUri = `gs://${storageBucketName()}/${clipPath}`;
        const concat = await within(startConcatenation(
          app, storageBucketName(), record.uid, jobId, [clipUri],
          record.resolution, record.aspectRatio, durationSeconds, uploadedVideos,
          Boolean(soundtrack) || uploadedVideos.length > 0
        ), 20_000, 'Avvio composizione media Video AI');
        await ref.set({
          providerVideoUri: uri,
          singleClipUri: clipUri,
          transcoderJobName: concat.name,
          transcoderOutputPath: concat.outputPath,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return json(res, 200, { jobId, status: 'PROCESSING', progress: 82, stage: 'SONARA Video AI: combinazione file caricati' });
      }
      const videoUrl = await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri), 45_000, 'Salvataggio video');
      await ref.set({ status: 'COMPLETED', providerVideoUri: uri, videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const pollErrors = Math.max(0, Number(record.pollErrors || 0)) + 1;
      await ref.set({ pollErrors, lastPollError: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (pollErrors < 6) return json(res, 200, { jobId, status: 'PROCESSING', progress: 50, stage: `SONARA Video AI: riconnessione rendering (${pollErrors}/6)` });
      const finalMessage = await failAndRefund(record, jobId, ref, app, `Rendering Video AI non raggiungibile: ${message}`);
      return json(res, 200, { jobId, status: 'FAILED', progress: 0, stage: 'Errore', error: finalMessage });
    }
  } catch (cause) {
    console.error('[SONARA VIDEO] job route failure', cause);
    return fail(res, 500, 'VIDEO_INTERNAL_ERROR', cause instanceof Error ? cause.message : 'Errore interno Video AI.');
  }
}
