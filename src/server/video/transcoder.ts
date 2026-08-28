import { randomUUID } from 'node:crypto';
import type { App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import type { SonaraVideoResolution } from '../../billing/plans';

const LOCATION = 'us-central1';

function projectId(app: App) {
  return String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || app.options.projectId || '').trim();
}

async function accessToken(app: App) {
  const token = await app.options.credential?.getAccessToken();
  if (!token?.access_token) throw new Error('Credenziale Google Cloud non disponibile per Transcoder.');
  return token.access_token;
}

function videoSettings(resolution: SonaraVideoResolution, aspectRatio: '16:9' | '9:16') {
  const landscape = resolution === '4k' ? [3840, 2160, 35_000_000] : resolution === '1080p' ? [1920, 1080, 8_000_000] : [1280, 720, 5_000_000];
  const [width, height, bitrateBps] = aspectRatio === '9:16' ? [landscape[1], landscape[0], landscape[2]] : landscape;
  return { widthPixels: width, heightPixels: height, bitrateBps, frameRate: 30 };
}

type TimelineClip = { key: string; uri: string; seconds: number };

function buildTimeline(generatedUris: string[], sourceVideoUris: string[], durationSeconds: number) {
  const target = Math.max(1, durationSeconds);
  const sourceBudget = sourceVideoUris.length ? Math.min(target * 0.4, sourceVideoUris.length * 4) : 0;
  const sourceSeconds = sourceVideoUris.length ? sourceBudget / sourceVideoUris.length : 0;
  const generatedBudget = Math.max(0.5, target - sourceBudget);
  const generatedSeconds = generatedUris.length ? generatedBudget / generatedUris.length : 0;
  const generated = generatedUris.map((uri, index): TimelineClip => ({ key: `generated-${index}`, uri, seconds: Math.min(8, Math.max(0.5, generatedSeconds)) }));
  const source = sourceVideoUris.map((uri, index): TimelineClip => ({ key: `source-${index}`, uri, seconds: Math.max(0.5, sourceSeconds) }));
  const timeline: TimelineClip[] = [];
  const max = Math.max(generated.length, source.length);
  for (let index = 0; index < max; index += 1) {
    if (source[index]) timeline.push(source[index]);
    if (generated[index]) timeline.push(generated[index]);
  }
  let remaining = target;
  return timeline.flatMap(item => {
    if (remaining <= 0.01) return [];
    const seconds = Math.min(item.seconds, remaining);
    remaining -= seconds;
    return [{ ...item, seconds }];
  });
}

export async function startConcatenation(app: App, bucketName: string, userId: string, jobId: string, clipUris: string[], resolution: SonaraVideoResolution, aspectRatio: '16:9' | '9:16', durationSeconds: number, sourceVideoUris: string[] = [], videoOnly = false) {
  const token = await accessToken(app);
  const id = projectId(app);
  const outputPrefix = `generated-videos/${userId}/${jobId}-final`;
  const timeline = buildTimeline(clipUris, sourceVideoUris, durationSeconds);
  if (!timeline.length) throw new Error('Nessuna sorgente video disponibile per il montaggio.');
  const inputs = timeline.map(item => ({ key: item.key, uri: item.uri }));
  const editList = timeline.map((item, index) => ({ key: `atom-${index}`, inputs: [item.key], startTimeOffset: '0s', endTimeOffset: `${Math.max(0.5, item.seconds).toFixed(3)}s` }));
  const elementaryStreams: any[] = [{ key: 'video', videoStream: { h264: videoSettings(resolution, aspectRatio) } }];
  if (!videoOnly) elementaryStreams.push({ key: 'audio', audioStream: { codec: 'aac', bitrateBps: 128000 } });
  const response = await fetch(`https://transcoder.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/us-central1/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ config: { inputs, editList, elementaryStreams, muxStreams: [{ key: 'sonara-video', container: 'mp4', elementaryStreams: videoOnly ? ['video'] : ['video', 'audio'] }], output: { uri: `gs://${bucketName}/${outputPrefix}/` } }, ttlAfterCompletionDays: 7 })
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Transcoder API HTTP ${response.status}`));
  return { name: String(payload.name), outputPath: `${outputPrefix}/sonara-video.mp4` };
}

export async function startSoundtrackMux(app: App, bucketName: string, userId: string, jobId: string, videoUri: string, soundtrackUri: string, resolution: SonaraVideoResolution, aspectRatio: '16:9' | '9:16', durationSeconds: number) {
  const token = await accessToken(app);
  const id = projectId(app);
  const outputPrefix = `generated-videos/${userId}/${jobId}-soundtrack`;
  const target = Math.max(1, durationSeconds);
  const response = await fetch(`https://transcoder.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/us-central1/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ config: { inputs: [{ key: 'soundtrack-input', uri: soundtrackUri }, { key: 'video-input', uri: videoUri }], editList: [{ key: 'atom-0', inputs: ['soundtrack-input', 'video-input'], startTimeOffset: '0s', endTimeOffset: `${target.toFixed(3)}s` }], elementaryStreams: [{ key: 'video', videoStream: { h264: videoSettings(resolution, aspectRatio) } }, { key: 'audio', audioStream: { codec: 'aac', bitrateBps: 192000 } }], muxStreams: [{ key: 'sonara-video', container: 'mp4', elementaryStreams: ['video', 'audio'] }], output: { uri: `gs://${bucketName}/${outputPrefix}/` } }, ttlAfterCompletionDays: 7 })
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Transcoder soundtrack HTTP ${response.status}`));
  return { name: String(payload.name), outputPath: `${outputPrefix}/sonara-video.mp4` };
}

export async function pollConcatenation(app: App, jobName: string) {
  const token = await accessToken(app);
  const response = await fetch(`https://transcoder.googleapis.com/v1/${jobName}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const payload = await response.json() as any;
  if (!response.ok) throw new Error(String(payload?.error?.message || `Transcoder API HTTP ${response.status}`));
  return { state: String(payload.state || 'PENDING'), error: payload.error?.message ? String(payload.error.message) : '' };
}

export async function publishTranscodedVideo(app: App, bucketName: string, outputPath: string) {
  const token = randomUUID();
  await getStorage(app).bucket(bucketName).file(outputPath).setMetadata({ contentType: 'video/mp4', cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } });
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(outputPath)}?alt=media&token=${encodeURIComponent(token)}`;
}
