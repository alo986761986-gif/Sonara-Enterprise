// SONARA site/provider audit: read-only. No authentication, job creation or customer audio.
const BASE = 'https://sonaraenterprise.com';
const API = 'https://api.sonaraenterprise.com';
const results = [];
const shortError = error => String(error?.name || 'UnknownError').slice(0, 60);

async function get(url, parse = 'json') {
  try {
    const response = await fetch(url, {
      headers: { accept: parse === 'json' ? 'application/json' : 'text/html,application/javascript', 'cache-control': 'no-cache' },
      redirect: 'manual',
      signal: AbortSignal.timeout(18000)
    });
    const ok = response.status === 200;
    const contentType = String(response.headers.get('content-type') || '');
    let data = null;
    if (ok && parse === 'json' && contentType.includes('json')) data = await response.json();
    if (ok && parse === 'text') data = (await response.text()).slice(0, 10_000_000);
    return { http: response.status, ok, type: contentType, data };
  } catch (error) {
    return { http: 0, ok: false, error: shortError(error), data: null };
  }
}

const billing = await get(BASE + '/api/billing/health');
const musicProvider = typeof billing.data?.musicProvider === 'string' ? billing.data.musicProvider.trim().toLowerCase() : '';
const aceBilling = ['ace_step_xl', 'ace_step', 'acestep', 'sonara_ace_step'].includes(musicProvider);
results.push({
  check: 'BILLING_SELECTED_PROVIDER',
  http: billing.http,
  reportedProvider: musicProvider || 'UNVERIFIED',
  aceStepConfirmed: aceBilling,
  status: billing.ok && aceBilling ? 'PASS' : billing.ok ? 'FAIL' : 'UNVERIFIED'
});

const sft = await get(API + '/api/sonara-relay/sft-capabilities');
results.push({
  check: 'GATEWAY_XL_SFT',
  http: sft.http,
  model: String(sft.data?.model || 'UNVERIFIED'),
  available: sft.data?.available === true,
  steps: typeof sft.data?.qualityProSteps === 'number' ? sft.data.qualityProSteps : null,
  status: sft.ok && sft.data?.available === true && sft.data?.model === 'acestep-v15-xl-sft' ? 'PASS' : 'UNVERIFIED'
});

const queue = await get(API + '/api/sonara-relay/queue-status');
const counts = queue.data?.counts || {};
results.push({
  check: 'R2_RELAY_JOB_QUEUE',
  http: queue.http,
  agentOnline: queue.data?.agentOnline === true,
  queued: Number.isFinite(counts.queued) ? counts.queued : null,
  leased: Number.isFinite(counts.leased) ? counts.leased : null,
  failedSample: Number.isFinite(counts.failed) ? counts.failed : null,
  truncated: queue.data?.truncated === true,
  status: queue.ok && queue.data?.agentOnline === true ? 'PASS' : 'UNVERIFIED'
});

const site = await get(BASE + '/?sonara_audit=' + Date.now(), 'text');
const html = typeof site.data === 'string' ? site.data : '';
const src = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] || '';
const bundle = src ? await get(BASE + src + '?audit=' + Date.now(), 'text') : { http: 0, ok: false, data: '' };
const js = typeof bundle.data === 'string' ? bundle.data : '';
results.push({
  check: 'LIVE_PROMPT_LIBERO_UI',
  http: site.http,
  assetHttp: bundle.http,
  bundlePathFound: Boolean(src),
  freeSelector: js.includes('PROMPT LIBERO'),
  guidedSelector: js.includes('MODALITÀ GUIDATA'),
  requestModeMarker: js.includes('sonaraPromptMode'),
  status: bundle.ok && js.includes('PROMPT LIBERO') && js.includes('MODALITÀ GUIDATA') && js.includes('sonaraPromptMode') ? 'PASS' : 'UNVERIFIED'
});

const stale = await get(API + '/api/sonara-multi/capabilities');
results.push({
  check: 'RETIRED_MODELS_NOT_EXPOSED',
  http: stale.http,
  source: String(stale.data?.version || 'UNVERIFIED'),
  modelCount: Object.keys(stale.data?.models || {}).length,
  status: stale.ok && stale.data?.version === 'sonara-ace-step-only' &&
    Object.keys(stale.data?.models || {}).length === 0 ? 'PASS' : 'UNVERIFIED'
});

for (const report of results) {
  process.stdout.write('SONARA_AUDIT_' + report.check + '=' + JSON.stringify(report) + '\n');
}
const critical = results.filter(x => x.check === 'BILLING_SELECTED_PROVIDER' || x.check === 'LIVE_PROMPT_LIBERO_UI');
if (critical.some(x => x.status !== 'PASS')) {
  console.error('SONARA_AUDIT_RESULT=NOT_VERIFIED_OR_MISROUTED');
  process.exitCode = 1;
} else {
  console.log('SONARA_AUDIT_RESULT=PROVIDER_AND_SITE_CONFIRMED');
}
console.log('SONARA_AUDIO_QUALITY_VERIFIED=false (a real generated WAV and listening test are required)');
