const VIDEO_UI_EDGE_SCRIPT = String.raw`(() => {
  if (window.__sonaraVideoUiEdgeV2) return;
  window.__sonaraVideoUiEdgeV2 = true;

  const RANDOM_PROMPTS = [
    'Cinematic music video at blue hour in a futuristic coastal city, anamorphic lens, slow dolly movement, volumetric lighting, realistic skin and fabrics, premium production design, rhythmic edits synchronized to the music.',
    'Dark underground club performance, deep shadows, red practical lights, handheld close-ups mixed with smooth gimbal tracking, atmospheric haze, realistic crowd movement, cinematic contrast, edits locked to kick and bass.',
    'Emotional night drive through rain-soaked streets, reflections on glass, shallow depth of field, elegant tracking shots, neon ambience, subtle film grain, realistic motion blur, music-driven cinematic pacing.',
    'Epic desert performance at sunset, wide aerial establishing shots, intimate portrait close-ups, wind in clothing and hair, dramatic backlight, natural skin texture, premium commercial cinematography, seamless musical transitions.',
    'Minimal black studio with sculptural light beams, fashion-performance direction, precise camera orbit, slow motion accents, glossy floor reflections, high-end music video finish, choreography synchronized with the arrangement.'
  ];

  const setReactValue = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const makeButton = (label, title, accent = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    Object.assign(button.style, {
      minHeight: '36px',
      padding: '8px 12px',
      borderRadius: '10px',
      border: accent ? '1px solid rgba(167,139,250,.55)' : '1px solid rgba(255,255,255,.10)',
      background: accent ? 'rgba(124,58,237,.18)' : 'rgba(255,255,255,.035)',
      color: accent ? '#ddd6fe' : '#cbd5e1',
      fontSize: '10px',
      fontWeight: '900',
      letterSpacing: '.04em',
      cursor: 'pointer'
    });
    return button;
  };

  const intelligentPrompt = current => {
    const base = String(current || '').trim();
    const seed = base || RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
    if (seed.includes('SONARA intelligent direction:')) return seed;
    return seed + '\n\nSONARA intelligent direction: preserve subject and visual continuity across every scene; professional shot progression from establishing to medium and close-up; motivated camera movement; physically believable lighting and materials; coherent color science; realistic motion; premium music-video production design; cuts, transitions and visual accents synchronized to the musical structure; avoid duplicated frames, abrupt identity changes, text artifacts, warped anatomy and random scene changes.';
  };

  const mount = () => {
    const root = document.querySelector('[data-sonara-video-ai="true"]');
    if (!(root instanceof HTMLElement)) return;
    const textarea = root.querySelector('textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    if (root.querySelector('[data-sonara-video-edge-controls="v2"]')) return;

    const toolbar = document.createElement('div');
    toolbar.dataset.sonaraVideoEdgeControls = 'v2';
    Object.assign(toolbar.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      margin: '0 0 10px 0',
      alignItems: 'center'
    });

    const clear = makeButton('✕ CANCELLA', 'Cancella tutto il prompt');
    clear.addEventListener('click', () => { setReactValue(textarea, ''); textarea.focus(); });

    const random = makeButton('↻ RANDOM', 'Genera un prompt professionale casuale');
    random.addEventListener('click', () => {
      const next = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
      setReactValue(textarea, next);
      textarea.focus();
    });

    const smart = makeButton('✦ INTELLIGENTE', 'Ottimizza regia, camera, luce, continuità e sincronizzazione musicale', true);
    smart.addEventListener('click', () => {
      setReactValue(textarea, intelligentPrompt(textarea.value));
      smart.textContent = '✓ OTTIMIZZATO';
      window.setTimeout(() => { smart.textContent = '✦ INTELLIGENTE'; }, 1800);
      textarea.focus();
    });

    toolbar.append(clear, random, smart);
    textarea.parentElement?.insertBefore(toolbar, textarea);
  };

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();`;

export function videoUiScriptResponse() {
  return new Response(VIDEO_UI_EDGE_SCRIPT, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-video-ui-edge': 'controls-v2'
    }
  });
}

export function injectVideoUiScript(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-video-ui-edge', 'controls-v2');
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('body', {
    element(element) {
      element.append('<script src="/sonara-video-ui-edge.js?v=2" defer></script>', { html: true });
    }
  }).transform(safe);
}
