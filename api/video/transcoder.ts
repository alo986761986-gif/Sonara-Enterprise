import { randomUUID } from 'node:crypto';
import type { App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import type { SonaraVideoResolution } from '../../src/billing/plans';

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

export async function startConcatenation(app: App, bucketName: string, userId: string, jobId: string, clipUris: string[], resolution: SonaraVideoResolution, aspectRatio: '16:9' | '9:16', durationSeconds: number) {
  const token = await accessToken(app);
  const id = projectId(app);
  const outputPrefix = `generated-videos/${userId}/${jobId}-final`;
  const inputs = clipUris.map((uri, index) => ({ key: `input-${index}`, uri }));
  let remaining = durationSeconds;
  const editList = inputs.map((input, index) => {
    const seconds = Math.min(8, remaining);
    remaining -= seconds;
    return { key: `atom-${index}`, inputs: [input.key], startTimeOffset: '0s', endTimeOffset: `${seconds}s` };
  });
  const response = await fetch(`https://transcoder.googleapis.com/v1/projects/${encodeURIComponent(id)}/locations/${LOCATION}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      config: {
        inputs,
        editList,
        elementaryStreams: [
          { key: 'video', videoStream: { h264: videoSettings(resolution, aspectRatio) } },
          { key: 'audio', audioStream: { codec: 'aac', bitrateBps: 128000 } }
        ],
        muxStreams: [{ key: 'sonara-video', container: 'mp4', elementaryStreams: ['video', 'audio'] }],
        output: { uri: `gs://${bucketName}/${outputPrefix}/` }
      },
      ttlAfterCompletionDays: 7
    })
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Transcoder API HTTP ${response.status}`));
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
  await getStorage(app).bucket(bucketName).file(outputPath).setMetadata({
    contentType: 'video/mp4',
    cacheControl: 'private,max-age=3600',
    metadata: { firebaseStorageDownloadTokens: token }
  });
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(outputPath)}?alt=media&token=${encodeURIComponent(token)}`;
}
