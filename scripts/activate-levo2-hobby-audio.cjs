const fs = require('node:fs');
const path = require('node:path');

if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'preview') {
  console.log('[SONARA][LeVo2] Hobby audio patch skipped outside preview.');
  process.exit(0);
}

const file = path.join(process.cwd(), 'api/billing/job.ts');
let source = fs.readFileSync(file, 'utf8');

function replaceRequired(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[SONARA][LeVo2] Hobby audio patch failed: ${label}`);
  source = source.replace(from, to);
}

const audioProxyMarker = "  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();";
const audioProxyBlock = `  const publicAudioJobId = queryValue(req.query?.jobId).trim();
  const publicAudioMode = queryValue(req.query?.audio).trim() === '1';
  if (publicAudioMode && /^levo_[A-Za-z0-9-]{16,}$/.test(publicAudioJobId)) {
    const levoBaseUrl = String(process.env.LEVO2_RESEARCH_API_URL || 'https://symbols-readily-boolean-personalized.trycloudflare.com').replace(/\\/$/, '');
    const levoKey = String(process.env.LEVO2_RESEARCH_API_KEY || '').trim();
    if (!levoKey) return sendJson(res, 503, { error: 'LeVo 2 preview credential is not configured.' });
    try {
      const jobResponse = await fetch(\`${'${levoBaseUrl}'}/job/${'${encodeURIComponent(publicAudioJobId)}'}\`, {
        headers: { Authorization: \`Bearer ${'${levoKey}'}\`, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000)
      });
      if (!jobResponse.ok) return sendJson(res, jobResponse.status, { error: 'LeVo 2 job is not available.' });
      const job = await jobResponse.json() as any;
      const audioPath = String(job?.audio_url || '');
      if (String(job?.status || '').toUpperCase() !== 'COMPLETED' || !audioPath.startsWith('/audio/')) {
        return sendJson(res, 409, { error: 'LeVo 2 audio is not ready.' });
      }
      const audioResponse = await fetch(\`${'${levoBaseUrl}'}${'${audioPath}'}\`, {
        headers: { Authorization: \`Bearer ${'${levoKey}'}\`, Accept: 'audio/*,*/*;q=0.8' },
        cache: 'no-store',
        signal: AbortSignal.timeout(55_000)
      });
      if (!audioResponse.ok) return sendJson(res, audioResponse.status, { error: 'LeVo 2 audio upstream failed.' });
      const bytes = Buffer.from(await audioResponse.arrayBuffer());
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', audioResponse.headers.get('content-type') || 'audio/flac');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('X-Sonara-Music-Provider', 'levo2-research');
      return res.status(200).send(bytes);
    } catch (error) {
      return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();`;

replaceRequired(
  audioProxyMarker,
  audioProxyBlock,
  'reuse job function for LeVo2 audio'
);

replaceRequired(
  "        const audioUrl = audioPath ? `/api/levo2/audio?path=${encodeURIComponent(audioPath)}` : null;",
  "        const audioUrl = audioPath ? `/api/billing/job?jobId=${encodeURIComponent(jobId)}&audio=1` : null;",
  'use existing billing job route for LeVo2 audio'
);

fs.writeFileSync(file, source, 'utf8');
console.log('[SONARA][LeVo2] Hobby-compatible audio proxy activated inside existing billing job function.');
