const fs = require('node:fs');
const path = require('node:path');

if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'preview') {
  console.log('[SONARA][LeVo2] Preview activator skipped outside Vercel preview.');
  process.exit(0);
}

const root = process.cwd();
const billingPath = path.join(root, 'api/billing/[...path].ts');
const jobPath = path.join(root, 'api/billing/job.ts');
const appPath = path.join(root, 'src/App.tsx');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, source) { fs.writeFileSync(file, source, 'utf8'); }
function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[SONARA][LeVo2] Preview patch failed: ${label}`);
  return source.replace(from, to);
}

function patchBilling() {
  let source = read(billingPath);

  source = replaceRequired(
    source,
    "const DEFAULT_ELEVEN_MUSIC_URL = 'https://sonara-enterprise.vercel.app/api/eleven-music/generate';",
    "const DEFAULT_ELEVEN_MUSIC_URL = 'https://sonara-enterprise.vercel.app/api/eleven-music/generate';\nconst DEFAULT_LEVO2_RESEARCH_URL = 'https://symbols-readily-boolean-personalized.trycloudflare.com';",
    'add LeVo2 preview URL'
  );

  const oldProvider = `  const provider = String(process.env.SONARA_MUSIC_PROVIDER || 'eleven_music').trim().toLowerCase();\n  const useEleven = provider === 'eleven' || provider === 'eleven_music' || provider === 'elevenlabs';\n  const targetUrl = useEleven\n    ? String(process.env.SONARA_ELEVEN_MUSIC_URL || DEFAULT_ELEVEN_MUSIC_URL).trim()\n    : \`\${String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\\/$/, '')}/api/engine/generate\`;\n\n  const headers: Record<string, string> = { 'Content-Type': 'application/json' };\n  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();\n  if (internalSecret) headers['X-Sonara-Internal-Secret'] = internalSecret;`;

  const newProvider = `  const provider = String(process.env.SONARA_MUSIC_PROVIDER || 'eleven_music').trim().toLowerCase();\n  const requestedEngineId = String(body.engineId || body.engine || '').trim().toLowerCase();\n  const useLeVo2 = requestedEngineId === 'sonara_levo2_research' || requestedEngineId === 'levo2-research' || provider === 'levo2_research' || provider === 'levo2-research' || provider === 'levo2';\n  const useEleven = !useLeVo2 && (provider === 'eleven' || provider === 'eleven_music' || provider === 'elevenlabs');\n  const targetUrl = useLeVo2\n    ? \`\${String(process.env.LEVO2_RESEARCH_API_URL || DEFAULT_LEVO2_RESEARCH_URL).replace(/\\/$/, '')}/generate\`\n    : useEleven\n      ? String(process.env.SONARA_ELEVEN_MUSIC_URL || DEFAULT_ELEVEN_MUSIC_URL).trim()\n      : \`\${String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\\/$/, '')}/api/engine/generate\`;\n\n  const headers: Record<string, string> = { 'Content-Type': 'application/json' };\n  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();\n  if (internalSecret) headers['X-Sonara-Internal-Secret'] = internalSecret;\n  if (useLeVo2) {\n    const levoKey = String(process.env.LEVO2_RESEARCH_API_KEY || '').trim();\n    if (!levoKey) return errorResponse(res, 503, 'LEVO2_PREVIEW_NOT_CONFIGURED', 'La credenziale privata LeVo 2 non è configurata nel preview SONARA.');\n    headers.Authorization = \`Bearer \${levoKey}\`;\n  }`;

  source = replaceRequired(source, oldProvider, newProvider, 'route billing generation to LeVo2');

  const oldBody = `      body: JSON.stringify({\n        ...body,\n        sonaraUserUid: user.uid,\n        durationSec: requestedSeconds,\n        duration: requestedSeconds,\n        weirdness,\n        styleInfluence,\n        provider: useEleven ? 'eleven_music' : body.provider,\n        engineProvider: useEleven ? 'eleven_music' : body.engineProvider,\n        candidateCount: useEleven ? 2 : body.candidateCount,\n        candidate_count: useEleven ? 2 : body.candidate_count\n      })`;

  const newBody = `      body: JSON.stringify(useLeVo2 ? {\n        research_only: true,\n        async: true,\n        prompt: body.prompt,\n        descriptions: body.prompt,\n        genre: body.subgenre || body.genre || 'Electronic',\n        mood: body.mood || '',\n        lyrics: body.lyrics || '',\n        title: body.title || 'Sonara LeVo 2 Research Track',\n        duration_sec: Math.min(requestedSeconds, 270),\n        generate_type: body.vocalMode === 'instrumental' ? 'bgm' : 'mixed',\n        auto_prompt_audio_type: body.genreFamily?.includes('Hip') ? 'Hip-Hop' : body.genreFamily?.includes('Rock') ? 'Rock' : body.genreFamily?.includes('Jazz') ? 'Jazz' : body.genreFamily?.includes('Pop') ? 'Pop' : 'Electronic'\n      } : {\n        ...body,\n        sonaraUserUid: user.uid,\n        durationSec: requestedSeconds,\n        duration: requestedSeconds,\n        weirdness,\n        styleInfluence,\n        provider: useEleven ? 'eleven_music' : body.provider,\n        engineProvider: useEleven ? 'eleven_music' : body.engineProvider,\n        candidateCount: useEleven ? 2 : body.candidateCount,\n        candidate_count: useEleven ? 2 : body.candidate_count\n      })`;

  source = replaceRequired(source, oldBody, newBody, 'send async LeVo2 payload');

  const oldRaw = `    const raw = await engineResponse.text();\n    if (!engineResponse.ok && reservation) await finishReservation(user.uid, reservation.reservationId, 'released');`;
  const newRaw = `    let raw = await engineResponse.text();\n    if (useLeVo2 && engineResponse.ok) {\n      try {\n        const levo = raw ? JSON.parse(raw) : {};\n        raw = JSON.stringify({\n          jobId: levo.job_id,\n          status: String(levo.status || 'QUEUED').toUpperCase(),\n          progress: Number(levo.progress || 0),\n          metadata: {\n            provider: 'levo2-research',\n            engine: 'LeVo2-v2-large',\n            researchOnly: true,\n            currentStage: levo.stage || 'LeVo 2 generation queued'\n          }\n        });\n      } catch {}\n    }\n    if (!engineResponse.ok && reservation) await finishReservation(user.uid, reservation.reservationId, 'released');`;

  source = replaceRequired(source, oldRaw, newRaw, 'normalize LeVo2 initial job response');

  source = replaceRequired(
    source,
    "    res.setHeader('X-Sonara-Music-Provider', useEleven ? 'eleven-music-v2' : 'legacy-engine');",
    "    res.setHeader('X-Sonara-Music-Provider', useLeVo2 ? 'levo2-research' : useEleven ? 'eleven-music-v2' : 'legacy-engine');",
    'expose LeVo2 provider header'
  );

  write(billingPath, source);
}

function patchJobBridge() {
  let source = read(jobPath);

  source = replaceRequired(
    source,
    "  return /^(?:d6_|d9pair_|d16pair_)[A-Za-z0-9-]{16,}$/.test(jobId);",
    "  return /^(?:d6_|d9pair_|d16pair_|levo_)[A-Za-z0-9-]{16,}$/.test(jobId);",
    'accept LeVo2 job IDs'
  );

  const marker = `  const engineBaseUrl = String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\\/$/, '');`;
  const replacement = `  const isLeVo2 = jobId.startsWith('levo_');\n  const levoBaseUrl = String(process.env.LEVO2_RESEARCH_API_URL || 'https://symbols-readily-boolean-personalized.trycloudflare.com').replace(/\\/$/, '');\n  const levoKey = String(process.env.LEVO2_RESEARCH_API_KEY || '').trim();\n  const engineBaseUrl = String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\\/$/, '');`;
  source = replaceRequired(source, marker, replacement, 'configure LeVo2 polling');

  const fetchOld = `    const engineResponse = await fetch(\n      \`\${engineBaseUrl}/api/music/job/\${encodeURIComponent(jobId)}\`,\n      {\n        method: 'GET',\n        headers,\n        cache: 'no-store',\n        signal: AbortSignal.timeout(150_000)\n      }\n    );\n\n    const raw = await engineResponse.text();`;

  const fetchNew = `    if (isLeVo2 && !levoKey) {\n      return sendJson(res, 503, { jobId, status: 'FAILED', progress: 0, error: 'LeVo 2 preview credential is not configured.' });\n    }\n    if (isLeVo2) headers.Authorization = \`Bearer \${levoKey}\`;\n\n    const engineResponse = await fetch(\n      isLeVo2\n        ? \`\${levoBaseUrl}/job/\${encodeURIComponent(jobId)}\`\n        : \`\${engineBaseUrl}/api/music/job/\${encodeURIComponent(jobId)}\`,\n      {\n        method: 'GET',\n        headers,\n        cache: 'no-store',\n        signal: AbortSignal.timeout(150_000)\n      }\n    );\n\n    let raw = await engineResponse.text();\n    if (isLeVo2 && engineResponse.ok) {\n      try {\n        const levo = raw ? JSON.parse(raw) : {};\n        const audioPath = String(levo.audio_url || '');\n        const audioUrl = audioPath ? \`/api/levo2/audio?path=\${encodeURIComponent(audioPath)}\` : null;\n        raw = JSON.stringify({\n          jobId,\n          status: String(levo.status || 'PROCESSING').toUpperCase(),\n          progress: Number(levo.progress || 0),\n          audioUrl,\n          metadata: {\n            ...(levo.metadata || {}),\n            provider: 'levo2-research',\n            engine: 'LeVo2-v2-large',\n            researchOnly: true,\n            audioUrl,\n            audioFormat: audioPath.toLowerCase().endsWith('.wav') ? 'wav' : audioPath.toLowerCase().endsWith('.mp3') ? 'mp3' : 'flac',\n            currentStage: levo.stage || (String(levo.status || '').toUpperCase() === 'COMPLETED' ? 'Audio ready' : 'LeVo 2 is generating on RTX PRO 6000')\n          },\n          error: levo.error || null\n        });\n      } catch {}\n    }`;

  source = replaceRequired(source, fetchOld, fetchNew, 'poll LeVo2 worker and proxy audio URL');
  write(jobPath, source);
}

function patchFrontend() {
  let source = read(appPath);
  source = replaceRequired(
    source,
    "          engineId: 'sonara_ace_step_v15_modal'",
    "          engineId: 'sonara_levo2_research'",
    'select LeVo2 in preview frontend'
  );
  write(appPath, source);
}

patchBilling();
patchJobBridge();
patchFrontend();
require('./activate-levo2-hobby-audio.cjs');
console.log('[SONARA][LeVo2] Vercel preview wired to async LeVo 2 R&D worker. Production remains untouched.');
