import sonaraWebLive from './sonara-web-live-ui.mjs';

const DJ_ROUTE = '/dj-pro';
const DJ_RUNTIME_PREFIX = '/dj-pro-runtime';
const DJ_PREVIEW_ORIGIN = 'https://sonara-enterprise-eejyho4nr-sonaramusicai86-2765s-projects.vercel.app';
const DJ_PREVIEW_SHARE = 'DBC4lMe93fqaflFgK5xJblb17i9TBiQm';
const DJ_BRIDGE_URL = 'ws://127.0.0.1:49686';
const Z1_AUDIO_SCRIPT_PATH = '/sonara-z1-audio-edge.js';

const Z1_AUDIO_SCRIPT = String.raw`(() => {
  if (window.__sonaraZ1AudioEdgeV1) return;
  window.__sonaraZ1AudioEdgeV1 = true;

  const ROOT_ID = 'sonara-z1-audio-edge';
  const ROUTING_KEY = 'sonara.dj.audio-routing.v1';
  let outputs = [];

  const readRouting = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(ROUTING_KEY) || '{}');
      return { masterOutput: saved.masterOutput || 'default', cueOutput: saved.cueOutput || 'default', input: saved.input || 'default' };
    } catch {
      return { masterOutput: 'default', cueOutput: 'default', input: 'default' };
    }
  };

  let routing = readRouting();

  const publish = () => {
    try {
      window.dispatchEvent(new CustomEvent('sonara:dj-audio-routing', { detail: routing }));
    } catch {}
  };

  const saveMaster = value => {
    routing = { ...routing, masterOutput: value || 'default' };
    try { localStorage.setItem(ROUTING_KEY, JSON.stringify(routing)); } catch {}
    publish();
  };

  const status = message => {
    const node = document.getElementById(ROOT_ID + '-status');
    if (node) node.textContent = message;
  };

  const deviceLabel = (device, index) => device.label || ('Uscita audio ' + (index + 1));

  const fillSelect = () => {
    const select = document.getElementById(ROOT_ID + '-select');
    if (!(select instanceof HTMLSelectElement)) return;
    const current = routing.masterOutput || 'default';
    select.innerHTML = '';
    const fallback = document.createElement('option');
    fallback.value = 'default';
    fallback.textContent = 'Sistema predefinito';
    select.appendChild(fallback);
    outputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = deviceLabel(device, index);
      select.appendChild(option);
    });
    const exists = current === 'default' || outputs.some(device => device.deviceId === current);
    select.value = exists ? current : 'default';
  };

  const scan = async (requestPermission = true) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      status('Browser senza enumerazione audio. Imposta Z1 MK2 come uscita predefinita di Windows.');
      return;
    }
    let stream = null;
    try {
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); } catch {}
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      outputs = devices.filter(device => device.kind === 'audiooutput');
      const z1 = outputs.find(device => /(^|\s|traktor|native).*z1/i.test(device.label || '') || /z1/i.test(device.label || ''));
      if (z1 && (routing.masterOutput === 'default' || !outputs.some(device => device.deviceId === routing.masterOutput))) {
        saveMaster(z1.deviceId);
      }
      fillSelect();
      if (z1) {
        status('Z1 MK2 rilevato. Master impostato su ' + (z1.label || 'Z1 MK2') + '. Premi TEST MASTER.');
      } else if (outputs.length) {
        status(outputs.length + ' uscite rilevate. Scegli Z1 MK2 dal menu; se non compare, impostalo prima in Windows.');
      } else {
        status('Nessuna uscita audio visibile. Imposta Z1 MK2 come uscita Windows e riapri Chrome/Edge.');
      }
    } catch (error) {
      status(error && error.message ? error.message : 'Scansione audio non riuscita.');
    } finally {
      if (stream) stream.getTracks().forEach(track => track.stop());
    }
  };

  const testMaster = async () => {
    const sinkSupported = typeof HTMLMediaElement !== 'undefined' && typeof HTMLMediaElement.prototype.setSinkId === 'function';
    if (!sinkSupported) {
      status('Questo browser non permette la selezione diretta. Imposta Z1 MK2 come uscita predefinita di Windows.');
      return;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      status('Web Audio non disponibile in questo browser.');
      return;
    }
    let ctx;
    try {
      ctx = new AudioContextCtor({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') await ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const destination = ctx.createMediaStreamDestination();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      oscillator.connect(gain).connect(destination);
      const audio = new Audio();
      audio.srcObject = destination.stream;
      await audio.setSinkId(routing.masterOutput || 'default');
      await audio.play();
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.38);
      window.setTimeout(() => {
        audio.pause();
        audio.srcObject = null;
        try { ctx.close(); } catch {}
      }, 600);
      publish();
      status('TEST MASTER inviato. Se senti il tono, l’uscita Z1 è pronta.');
    } catch (error) {
      try { if (ctx) ctx.close(); } catch {}
      status((error && error.message ? error.message : 'Test non riuscito.') + ' Verifica Z1 in Windows.');
    }
  };

  const makeButton = (label, primary) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      minHeight: '36px', padding: '8px 12px', borderRadius: '10px',
      border: primary ? '1px solid rgba(34,211,238,.65)' : '1px solid rgba(71,85,105,.85)',
      background: primary ? 'rgba(34,211,238,.16)' : 'rgba(2,6,23,.92)',
      color: primary ? '#a5f3fc' : '#cbd5e1', fontSize: '9px', fontWeight: '900', cursor: 'pointer'
    });
    return button;
  };

  const mount = () => {
    const consoleRoot = document.querySelector('[data-ni-console="true"]');
    if (!(consoleRoot instanceof HTMLElement)) return;
    if (consoleRoot.querySelector('.ni-audio')) {
      publish();
      return;
    }
    if (document.getElementById(ROOT_ID)) return;

    const section = document.createElement('section');
    section.id = ROOT_ID;
    Object.assign(section.style, {
      borderRadius: '18px', border: '1px solid rgba(34,211,238,.20)', background: '#080b11',
      padding: '16px', boxShadow: '0 16px 38px rgba(0,0,0,.24)'
    });

    const title = document.createElement('div');
    title.textContent = 'AUDIO Z1 MK2';
    Object.assign(title.style, { color: '#fff', fontSize: '12px', fontWeight: '900', letterSpacing: '.05em' });
    const subtitle = document.createElement('div');
    subtitle.textContent = 'X1 controlla i deck. L’audio Master deve uscire da Traktor Z1 MK2 oppure dall’uscita predefinita di Windows.';
    Object.assign(subtitle.style, { marginTop: '5px', color: '#64748b', fontSize: '9px', fontWeight: '700' });

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) auto auto', gap: '8px', marginTop: '12px', alignItems: 'center' });
    const select = document.createElement('select');
    select.id = ROOT_ID + '-select';
    Object.assign(select.style, { minHeight: '38px', borderRadius: '10px', border: '1px solid #334155', background: '#020617', color: '#fff', padding: '8px 10px', fontSize: '9px', fontWeight: '800' });
    select.addEventListener('change', () => {
      saveMaster(select.value);
      const option = select.options[select.selectedIndex];
      status('Master selezionato: ' + (option ? option.textContent : select.value) + '. Premi TEST MASTER.');
    });

    const scanButton = makeButton('SCANSIONA AUDIO', true);
    scanButton.addEventListener('click', () => scan(true));
    const testButton = makeButton('TEST MASTER', false);
    testButton.addEventListener('click', testMaster);

    row.appendChild(select);
    row.appendChild(scanButton);
    row.appendChild(testButton);

    const message = document.createElement('div');
    message.id = ROOT_ID + '-status';
    message.textContent = 'Premi SCANSIONA AUDIO, scegli Z1 MK2 e poi TEST MASTER.';
    Object.assign(message.style, { marginTop: '10px', borderRadius: '10px', border: '1px solid rgba(51,65,85,.75)', background: 'rgba(2,6,23,.75)', padding: '9px 10px', color: '#94a3b8', fontSize: '9px', fontWeight: '700' });

    section.appendChild(title);
    section.appendChild(subtitle);
    section.appendChild(row);
    section.appendChild(message);

    const decks = consoleRoot.querySelector('.ni-decks');
    if (decks && decks.parentElement === consoleRoot) consoleRoot.insertBefore(section, decks);
    else consoleRoot.appendChild(section);

    fillSelect();
    scan(false);
    publish();
  };

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => scan(false));
  }
  const keepRoutingAlive = window.setInterval(() => {
    mount();
    if (document.querySelector('[data-ni-console="true"]')) publish();
  }, 700);
  window.addEventListener('pagehide', () => window.clearInterval(keepRoutingAlive), { once: true });
})();`;

function copyRequestHeaders(request) {
  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'range', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function previewUrl(pathname, search = '') {
  const target = new URL(pathname + search, DJ_PREVIEW_ORIGIN);
  target.searchParams.set('_vercel_share', DJ_PREVIEW_SHARE);
  return target;
}

function firstCookie(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(';', 1)[0] || '';
}

async function fetchPreview(request, pathname, search = '') {
  const headers = copyRequestHeaders(request);
  let response = await fetch(previewUrl(pathname, search), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    redirect: 'manual'
  });

  for (let attempt = 0; attempt < 2 && response.status >= 300 && response.status < 400; attempt += 1) {
    const location = response.headers.get('location');
    if (!location) break;
    const cookie = firstCookie(response.headers.get('set-cookie'));
    if (cookie) headers.set('cookie', cookie);
    const next = new URL(location, DJ_PREVIEW_ORIGIN);
    if (next.origin !== DJ_PREVIEW_ORIGIN) break;
    response = await fetch(next, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'manual'
    });
  }

  return response;
}

function proxiedHeaders(response, { html = false, transformed = false } = {}) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  if (transformed) headers.delete('content-encoding');
  headers.delete('set-cookie');
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');
  headers.set('x-sonara-dj-proxy', 'cloudflare-preview-bridge-v2');
  if (html) headers.set('cache-control', 'no-store, max-age=0');
  return headers;
}

function rewriteRuntimePaths(text) {
  return text
    .replaceAll('"/assets/', `"${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll("'/assets/", `'${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll('url(/assets/', `url(${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll('url("/assets/', `url("${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll("url('/assets/", `url('${DJ_RUNTIME_PREFIX}/assets/`);
}

function bootstrapScript() {
  return `<script>(function(){try{localStorage.setItem('sonara.dj.bridge-url','${DJ_BRIDGE_URL}');}catch(e){};window.__SONARA_DJ_PROXIED__=true;})();</script>`;
}

function z1AudioScriptResponse() {
  return new Response(Z1_AUDIO_SCRIPT, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-edge-feature': 'z1-audio-routing-v1'
    }
  });
}

async function injectZ1Audio(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, max-age=0');
  const cloned = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('body', {
    element(element) {
      element.append(`<script src="${Z1_AUDIO_SCRIPT_PATH}?v=1" defer></script>`, { html: true });
    }
  }).transform(cloned);
}

async function serveDjApp(request) {
  const upstream = await fetchPreview(request, '/', '');
  if (!upstream.ok) return upstream;
  const type = upstream.headers.get('content-type') || '';
  if (!type.includes('text/html')) return upstream;
  let html = await upstream.text();
  html = rewriteRuntimePaths(html);
  const bootstrap = bootstrapScript();
  html = html.includes('<head>') ? html.replace('<head>', `<head>${bootstrap}`) : `${bootstrap}${html}`;
  return new Response(html, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: proxiedHeaders(upstream, { html: true, transformed: true })
  });
}

async function serveDjRuntime(request, url) {
  const relative = url.pathname.slice(DJ_RUNTIME_PREFIX.length) || '/';
  const upstream = await fetchPreview(request, relative, url.search);
  const type = upstream.headers.get('content-type') || '';
  const shouldTransform = type.includes('javascript') || type.includes('text/css') || type.includes('application/json');
  if (!shouldTransform || request.method === 'HEAD') {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: proxiedHeaders(upstream)
    });
  }
  const text = rewriteRuntimePaths(await upstream.text());
  return new Response(text, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: proxiedHeaders(upstream, { transformed: true })
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === Z1_AUDIO_SCRIPT_PATH) return z1AudioScriptResponse();
    if (url.pathname === DJ_ROUTE || url.pathname === `${DJ_ROUTE}/`) {
      return injectZ1Audio(await serveDjApp(request));
    }
    if (url.pathname.startsWith(`${DJ_RUNTIME_PREFIX}/`)) {
      return serveDjRuntime(request, url);
    }
    return injectZ1Audio(await sonaraWebLive.fetch(request, env, ctx));
  }
};
