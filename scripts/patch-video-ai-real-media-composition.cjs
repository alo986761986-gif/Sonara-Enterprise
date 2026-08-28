const fs = require('node:fs');

function patch(path, replacements) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`${path}: patch non trovata: ${label}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patch('api/video/job/[id].ts', [
  [
    "import { pollConcatenation, publishTranscodedVideo, startConcatenation } from '../../../src/server/video/transcoder';",
    "import { pollConcatenation, publishTranscodedVideo, startConcatenation, startSoundtrackMux } from '../../../src/server/video/transcoder';",
    'transcoder soundtrack import'
  ],
  [
    "  transcoderJobName?: string;\n  transcoderOutputPath?: string;\n  mediaReferences?: MediaReference[];",
    "  transcoderJobName?: string;\n  transcoderOutputPath?: string;\n  soundtrackJobName?: string;\n  soundtrackOutputPath?: string;\n  singleClipUri?: string;\n  mediaReferences?: MediaReference[];",
    'job media composition state'
  ],
  [
    "function bearerToken(req: any) {",
    `function sourceVideoUris(record: VideoJobRecord) {\n  const bucket = storageBucketName();\n  return (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])\n    .filter(item => item?.sourceKind === 'video' && typeof item.originalStoragePath === 'string' && item.originalStoragePath.trim())\n    .map(item => \`gs://\${bucket}/\${String(item.originalStoragePath).trim()}\`)\n    .slice(0, 6);\n}\n\nfunction soundtrackUri(record: VideoJobRecord) {\n  const bucket = storageBucketName();\n  const audio = (Array.isArray(record.mediaReferences) ? record.mediaReferences : [])\n    .find(item => item?.sourceKind === 'audio' && typeof item.storagePath === 'string' && item.storagePath.trim());\n  return audio ? \`gs://\${bucket}/\${String(audio.storagePath).trim()}\` : '';\n}\n\nfunction bearerToken(req: any) {`,
    'source video and soundtrack helpers'
  ],
  [
    "        const concat = await within(startConcatenation(app, storageBucketName(), record.uid, jobId, operations.map(item => String(item.clipUri)), record.resolution, record.aspectRatio, durationSeconds), 20_000, 'Avvio montaggio video');",
    "        const uploadedVideos = sourceVideoUris(record);\n        const soundtrack = soundtrackUri(record);\n        const concat = await within(startConcatenation(app, storageBucketName(), record.uid, jobId, operations.map(item => String(item.clipUri)), record.resolution, record.aspectRatio, durationSeconds, uploadedVideos, Boolean(soundtrack) || uploadedVideos.length > 0), 20_000, 'Avvio montaggio video');",
    'multi clip real video composition'
  ],
  [
    "      const videoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.transcoderOutputPath));\n      await ref.set({ status: 'COMPLETED', videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });\n    }\n\n    if (!String(record.operationName || '').trim()) {",
    `      const soundtrack = soundtrackUri(record);\n      if (soundtrack) {\n        if (!record.soundtrackJobName) {\n          const mixed = await within(startSoundtrackMux(\n            app, storageBucketName(), record.uid, jobId,\n            \`gs://\${storageBucketName()}/\${String(record.transcoderOutputPath)}\`, soundtrack,\n            record.resolution, record.aspectRatio, durationSeconds\n          ), 20_000, 'Avvio soundtrack Video AI');\n          await ref.set({ soundtrackJobName: mixed.name, soundtrackOutputPath: mixed.outputPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n          return json(res, 200, { jobId, status: 'PROCESSING', progress: 95, stage: 'SONARA Video AI: applicazione audio caricato' });\n        }\n        const mixed = await within(pollConcatenation(app, record.soundtrackJobName), 15_000, 'Controllo soundtrack Video AI');\n        if (mixed.state === 'FAILED') throw new Error(mixed.error || 'Applicazione audio fallita.');\n        if (mixed.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 97, stage: 'SONARA Video AI: mix audio/video' });\n        const mixedVideoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.soundtrackOutputPath));\n        await ref.set({ status: 'COMPLETED', videoUrl: mixedVideoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n        return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto con media caricati', videoUrl: mixedVideoUrl });\n      }\n      const videoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.transcoderOutputPath));\n      await ref.set({ status: 'COMPLETED', videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: sourceVideoUris(record).length ? 'Video pronto con clip caricate' : 'Video pronto', videoUrl });\n    }\n\n    if (record.transcoderJobName) {\n      const transcoder = await within(pollConcatenation(app, record.transcoderJobName), 15_000, 'Controllo montaggio media Video AI');\n      if (transcoder.state === 'FAILED') throw new Error(transcoder.error || 'Montaggio media Video AI fallito.');\n      if (transcoder.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 88, stage: 'SONARA Video AI: composizione media caricati' });\n\n      const soundtrack = soundtrackUri(record);\n      if (soundtrack) {\n        if (!record.soundtrackJobName) {\n          const mixed = await within(startSoundtrackMux(\n            app, storageBucketName(), record.uid, jobId,\n            \`gs://\${storageBucketName()}/\${String(record.transcoderOutputPath)}\`, soundtrack,\n            record.resolution, record.aspectRatio, durationSeconds\n          ), 20_000, 'Avvio soundtrack Video AI');\n          await ref.set({ soundtrackJobName: mixed.name, soundtrackOutputPath: mixed.outputPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n          return json(res, 200, { jobId, status: 'PROCESSING', progress: 95, stage: 'SONARA Video AI: applicazione audio caricato' });\n        }\n        const mixed = await within(pollConcatenation(app, record.soundtrackJobName), 15_000, 'Controllo soundtrack Video AI');\n        if (mixed.state === 'FAILED') throw new Error(mixed.error || 'Applicazione audio fallita.');\n        if (mixed.state !== 'SUCCEEDED') return json(res, 200, { jobId, status: 'PROCESSING', progress: 97, stage: 'SONARA Video AI: mix audio/video' });\n        const mixedVideoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.soundtrackOutputPath));\n        await ref.set({ status: 'COMPLETED', videoUrl: mixedVideoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n        return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto con media caricati', videoUrl: mixedVideoUrl });\n      }\n\n      const composedVideoUrl = await publishTranscodedVideo(app, storageBucketName(), String(record.transcoderOutputPath));\n      await ref.set({ status: 'COMPLETED', videoUrl: composedVideoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto con media caricati', videoUrl: composedVideoUrl });\n    }\n\n    if (!String(record.operationName || '').trim()) {`,
    'multi and single clip finishing with soundtrack'
  ],
  [
    "      const uri = String(operation.uri || '');\n      const videoUrl = await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri), 45_000, 'Salvataggio video');\n      await ref.set({ status: 'COMPLETED', providerVideoUri: uri, videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });",
    `      const uri = String(operation.uri || '');\n      const uploadedVideos = sourceVideoUris(record);\n      const soundtrack = soundtrackUri(record);\n      if (uploadedVideos.length || soundtrack) {\n        const clipPath = \`generated-videos/staging/\${record.uid}/\${jobId}/single-generated.mp4\`;\n        await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri, clipPath), 45_000, 'Salvataggio clip AI');\n        const clipUri = \`gs://\${storageBucketName()}/\${clipPath}\`;\n        const concat = await within(startConcatenation(\n          app, storageBucketName(), record.uid, jobId, [clipUri],\n          record.resolution, record.aspectRatio, durationSeconds, uploadedVideos,\n          Boolean(soundtrack) || uploadedVideos.length > 0\n        ), 20_000, 'Avvio composizione media Video AI');\n        await ref.set({\n          providerVideoUri: uri,\n          singleClipUri: clipUri,\n          transcoderJobName: concat.name,\n          transcoderOutputPath: concat.outputPath,\n          updatedAt: FieldValue.serverTimestamp()\n        }, { merge: true });\n        return json(res, 200, { jobId, status: 'PROCESSING', progress: 82, stage: 'SONARA Video AI: combinazione file caricati' });\n      }\n      const videoUrl = await within(persistProviderVideo(app, storageBucketName(), record.uid, jobId, uri), 45_000, 'Salvataggio video');\n      await ref.set({ status: 'COMPLETED', providerVideoUri: uri, videoUrl, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });\n      return json(res, 200, { jobId, status: 'COMPLETED', progress: 100, stage: 'Video pronto', videoUrl });`,
    'single clip real media composition'
  ]
]);

const transcoderPath = 'src/server/video/transcoder.ts';
fs.writeFileSync(transcoderPath, `import { randomUUID } from 'node:crypto';
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
  const generated = generatedUris.map((uri, index): TimelineClip => ({ key: \`generated-\${index}\`, uri, seconds: Math.min(8, Math.max(0.5, generatedSeconds)) }));
  const source = sourceVideoUris.map((uri, index): TimelineClip => ({ key: \`source-\${index}\`, uri, seconds: Math.max(0.5, sourceSeconds) }));
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
  const outputPrefix = \`generated-videos/\${userId}/\${jobId}-final\`;
  const timeline = buildTimeline(clipUris, sourceVideoUris, durationSeconds);
  if (!timeline.length) throw new Error('Nessuna sorgente video disponibile per il montaggio.');
  const inputs = timeline.map(item => ({ key: item.key, uri: item.uri }));
  const editList = timeline.map((item, index) => ({ key: \`atom-\${index}\`, inputs: [item.key], startTimeOffset: '0s', endTimeOffset: \`\${Math.max(0.5, item.seconds).toFixed(3)}s\` }));
  const elementaryStreams: any[] = [{ key: 'video', videoStream: { h264: videoSettings(resolution, aspectRatio) } }];
  if (!videoOnly) elementaryStreams.push({ key: 'audio', audioStream: { codec: 'aac', bitrateBps: 128000 } });
  const response = await fetch(\`https://transcoder.googleapis.com/v1/projects/\${encodeURIComponent(id)}/locations/${LOCATION}/jobs\`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({ config: { inputs, editList, elementaryStreams, muxStreams: [{ key: 'sonara-video', container: 'mp4', elementaryStreams: videoOnly ? ['video'] : ['video', 'audio'] }], output: { uri: \`gs://\${bucketName}/\${outputPrefix}/\` } }, ttlAfterCompletionDays: 7 })
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || \`Transcoder API HTTP \${response.status}\`));
  return { name: String(payload.name), outputPath: \`\${outputPrefix}/sonara-video.mp4\` };
}

export async function startSoundtrackMux(app: App, bucketName: string, userId: string, jobId: string, videoUri: string, soundtrackUri: string, resolution: SonaraVideoResolution, aspectRatio: '16:9' | '9:16', durationSeconds: number) {
  const token = await accessToken(app);
  const id = projectId(app);
  const outputPrefix = \`generated-videos/\${userId}/\${jobId}-soundtrack\`;
  const target = Math.max(1, durationSeconds);
  const response = await fetch(\`https://transcoder.googleapis.com/v1/projects/\${encodeURIComponent(id)}/locations/${LOCATION}/jobs\`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({ config: { inputs: [{ key: 'soundtrack-input', uri: soundtrackUri }, { key: 'video-input', uri: videoUri }], editList: [{ key: 'atom-0', inputs: ['soundtrack-input', 'video-input'], startTimeOffset: '0s', endTimeOffset: \`\${target.toFixed(3)}s\` }], elementaryStreams: [{ key: 'video', videoStream: { h264: videoSettings(resolution, aspectRatio) } }, { key: 'audio', audioStream: { codec: 'aac', bitrateBps: 192000 } }], muxStreams: [{ key: 'sonara-video', container: 'mp4', elementaryStreams: ['video', 'audio'] }], output: { uri: \`gs://\${bucketName}/\${outputPrefix}/\` } }, ttlAfterCompletionDays: 7 })
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || \`Transcoder soundtrack HTTP \${response.status}\`));
  return { name: String(payload.name), outputPath: \`\${outputPrefix}/sonara-video.mp4\` };
}

export async function pollConcatenation(app: App, jobName: string) {
  const token = await accessToken(app);
  const response = await fetch(\`https://transcoder.googleapis.com/v1/\${jobName}\`, { headers: { Authorization: \`Bearer \${token}\` }, cache: 'no-store' });
  const payload = await response.json() as any;
  if (!response.ok) throw new Error(String(payload?.error?.message || \`Transcoder API HTTP \${response.status}\`));
  return { state: String(payload.state || 'PENDING'), error: payload.error?.message ? String(payload.error.message) : '' };
}

export async function publishTranscodedVideo(app: App, bucketName: string, outputPath: string) {
  const token = randomUUID();
  await getStorage(app).bucket(bucketName).file(outputPath).setMetadata({ contentType: 'video/mp4', cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } });
  return \`https://firebasestorage.googleapis.com/v0/b/\${encodeURIComponent(bucketName)}/o/\${encodeURIComponent(outputPath)}?alt=media&token=\${encodeURIComponent(token)}\`;
}
`);

console.log('SONARA Video AI real media composition patch applied.');
