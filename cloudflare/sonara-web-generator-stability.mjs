import sonaraProxy from './sonara-web-dj-proxy.mjs';

const BLOCKED_GENERATOR_EDGE_SCRIPTS = [
  'sonara-intelligent-lyrics-edge.js',
  'sonara-vocal-character-edge.js',
  'sonara-vocal-character-visible.js'
];
const BILLING_GENERATE_PATH = '/api/billing/generate';
const RETRYABLE_GENERATION_STATUSES = new Set([502, 503, 504, 524]);
const GENERATION_RETRY_DELAY_MS = 1200;
const AUDIO_GESTURE_UNLOCK_SCRIPT = String.raw`(() => {
  if (window.__sonaraAudioGestureUnlockV1) return;
  window.__sonaraAudioGestureUnlockV1 = true;

  const findGeneratedAudio = button => {
    let node = button;
    for (let depth = 0; depth < 7 && node; depth += 1, node = node.parentElement) {
      const audio = node.querySelector && node.querySelector('audio[src]');
      if (audio instanceof HTMLAudioElement) return audio;
    }
    return null;
  };

  const playInsideGesture = event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    const playIcon = button.querySelector('svg.lucide-play, svg[class*="lucide-play"], .lucide-play');
    if (!playIcon) return;

    const audio = findGeneratedAudio(button);
    if (!(audio instanceof HTMLAudioElement) || !audio.paused) return;

    audio.playsInline = true;
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(error => {
        console.warn('[SONARA][Playback Gesture]', error instanceof Error ? error.message : String(error));
      });
    }
  };

  document.addEventListener('click', playInsideGesture, true);
})();`;

const CREATOR_UI_HOTFIX_CSS = String.raw`
html body section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="bpm"]{
  display:block!important;
  margin-top:14px!important;
  margin-bottom:16px!important;
  padding:14px 16px!important;
  border:1px solid rgba(168,85,247,.22)!important;
  border-radius:16px!important;
  background:linear-gradient(180deg,rgba(88,28,135,.10),#101013)!important;
}
html body section[data-sonara-creator-skin="true"] input[aria-label="BPM preferiti"]{
  display:block!important;
  width:128px!important;
  min-width:128px!important;
  max-width:128px!important;
  padding-left:16px!important;
  padding-right:48px!important;
  text-align:left!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
  caret-color:#fff!important;
  font-size:22px!important;
  font-weight:950!important;
  font-variant-numeric:tabular-nums!important;
  letter-spacing:.01em!important;
  opacity:1!important;
  appearance:textfield!important;
}
html body section[data-sonara-creator-skin="true"] input[aria-label="BPM preferiti"]::-webkit-outer-spin-button,
html body section[data-sonara-creator-skin="true"] input[aria-label="BPM preferiti"]::-webkit-inner-spin-button{
  -webkit-appearance:none!important;
  margin:0!important;
}
@media(min-width:1280px){
  html body section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"]{
    top:62px!important;
    margin:52px 18px 20px!important;
    max-height:calc(100vh - 96px)!important;
  }
  html body section[data-sonara-creator-skin="true"]>[data-sonara-creator-single-result="true"]{
    top:62px!important;
    margin:52px 18px 20px!important;
  }
}`;

const CREATOR_UI_HOTFIX_SCRIPT = String.raw`(() => {
  if (window.__sonaraBpmWorkspaceHotfixV1) return;
  window.__sonaraBpmWorkspaceHotfixV1 = true;

  const BPM_PATTERN = /\b\d{2,3}\s*BPM\b/gi;
  const clampBpm = value => Math.max(40, Math.min(220, Math.round(Number(value) || 124)));

  const setReactTextareaValue = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const syncPromptBpm = bpmInput => {
    const prompt = document.getElementById('sonara-prompt');
    if (!(prompt instanceof HTMLTextAreaElement)) return;
    const bpm = clampBpm(bpmInput.value);
    const current = String(prompt.value || '');
    const next = BPM_PATTERN.test(current)
      ? current.replace(BPM_PATTERN, bpm + ' BPM')
      : current.trim()
        ? current.trimEnd() + '\n\nTempo lock: exactly ' + bpm + ' BPM.'
        : 'Tempo lock: exactly ' + bpm + ' BPM.';
    BPM_PATTERN.lastIndex = 0;
    if (next !== current) setReactTextareaValue(prompt, next);
  };

  const bind = () => {
    const bpmInput = document.querySelector('input[aria-label="BPM preferiti"]');
    if (!(bpmInput instanceof HTMLInputElement)) return;
    if (bpmInput.dataset.sonaraBpmPromptSync !== 'true') {
      bpmInput.dataset.sonaraBpmPromptSync = 'true';
      const sync = () => syncPromptBpm(bpmInput);
      bpmInput.addEventListener('input', sync);
      bpmInput.addEventListener('change', sync);
      sync();
    }
  };

  bind();
  const observer = new MutationObserver(bind);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();`;

function stripDuplicateGeneratorScripts(html) {
  return BLOCKED_GENERATOR_EDGE_SCRIPTS.reduce((output, scriptName) => {
    const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>`, 'gi');
    return output.replace(pattern, '');
  }, html);
}

function injectAudioGestureUnlock(html) {
  if (html.includes('__sonaraAudioGestureUnlockV1')) return html;
  const script = `<script>${AUDIO_GESTURE_UNLOCK_SCRIPT}</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
}

function injectCreatorUiHotfix(html) {
  if (html.includes('__sonaraBpmWorkspaceHotfixV1')) return html;
  const style = `<style id="sonara-bpm-workspace-hotfix-v1">${CREATOR_UI_HOTFIX_CSS}</style>`;
  const script = `<script>${CREATOR_UI_HOTFIX_SCRIPT}</script>`;
  const withStyle = html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : `${style}${html}`;
  return withStyle.includes('</body>') ? withStyle.replace('</body>', `${script}</body>`) : `${withStyle}${script}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jsonGenerationFailure(upstreamStatus, message) {
  return new Response(JSON.stringify({
    error: {
      code: 'GENERATION_UPSTREAM_RETRYABLE',
      message
    },
    retryable: true,
    upstreamStatus
  }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-sonara-generator-recovery': 'billing-json-v2'
    }
  });
}

async function normalizeBillingGenerationResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    headers.set('x-sonara-generator-recovery', 'billing-json-v2');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const upstreamStatus = response.status || 502;
  return jsonGenerationFailure(
    upstreamStatus,
    RETRYABLE_GENERATION_STATUSES.has(upstreamStatus)
      ? 'SONARA sta riattivando il motore di generazione. Riprova automaticamente senza perdere la sessione.'
      : `Il motore SONARA ha restituito una risposta non valida (HTTP ${upstreamStatus}).`
  );
}

async function generateWithRecovery(request, env, ctx) {
  const first = await sonaraProxy.fetch(request.clone(), env, ctx);
  if (!RETRYABLE_GENERATION_STATUSES.has(first.status)) {
    return normalizeBillingGenerationResponse(first);
  }

  await wait(GENERATION_RETRY_DELAY_MS);
  const second = await sonaraProxy.fetch(request.clone(), env, ctx);
  return normalizeBillingGenerationResponse(second);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === BILLING_GENERATE_PATH) {
      return generateWithRecovery(request, env, ctx);
    }

    const response = await sonaraProxy.fetch(request, env, ctx);
    const contentType = response.headers.get('content-type') || '';

    if (request.method === 'HEAD' || !contentType.includes('text/html')) {
      return response;
    }

    const html = injectCreatorUiHotfix(injectAudioGestureUnlock(stripDuplicateGeneratorScripts(await response.text())));
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('x-sonara-generator-stability', 'native-react-controls-v1');
    headers.set('x-sonara-playback-fix', 'direct-user-gesture-v1');
    headers.set('x-sonara-creator-ui-hotfix', 'bpm-workspace-v1');

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
