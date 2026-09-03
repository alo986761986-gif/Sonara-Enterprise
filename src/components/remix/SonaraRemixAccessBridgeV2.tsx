import { useEffect } from 'react';

const SIDEBAR_ENTRY = 'data-sonara-remix-sidebar-v2';
const YOUTUBE_PANEL = 'data-sonara-remix-youtube-panel-v2';
const YOUTUBE_TAB = 'data-sonara-remix-youtube-tab-v2';
const YOUTUBE_STORE = 'sonara.remix.youtubeReference.v2';

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function youtubeVideoId(value: string) {
  const text = value.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return (url.pathname.split('/').filter(Boolean)[0] || '').slice(0, 32);
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') return (url.searchParams.get('v') || '').slice(0, 32);
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0] || '')) return (parts[1] || '').slice(0, 32);
    }
  } catch {
    return '';
  }
  return '';
}

function findMainSidebar() {
  return Array.from(document.querySelectorAll<HTMLElement>('aside')).find(aside => {
    const text = normalize(aside.textContent || '');
    return /(panoramica|overview)/i.test(text) && /(crea la mia musica|generatore|generator)/i.test(text);
  }) || null;
}

function findCreatorButton(aside: HTMLElement | null) {
  if (!aside) return null;
  return Array.from(aside.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    const text = normalize(button.textContent || '');
    return /^(crea la mia musica|generatore|generator)\b/i.test(text);
  }) || null;
}

function copyButtonLook(source: HTMLButtonElement, target: HTMLButtonElement) {
  target.className = source.className;
  target.style.cssText = source.style.cssText;
  target.setAttribute('aria-label', 'Remix');
  target.title = 'Apri SONARA Remix';
}

function installSidebarEntry() {
  const aside = findMainSidebar();
  const creator = findCreatorButton(aside);
  if (!aside || !creator) return;

  let button = aside.querySelector<HTMLButtonElement>(`button[${SIDEBAR_ENTRY}]`);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(SIDEBAR_ENTRY, 'true');
    button.innerHTML = '<span aria-hidden="true" style="display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;color:#c4b5fd;font-size:20px;line-height:1">↻</span><span>Remix</span><span style="margin-left:auto;padding:3px 6px;border:1px solid rgba(167,139,250,.18);border-radius:6px;background:rgba(124,58,237,.08);color:#a78bfa;font-size:7px;font-weight:900;letter-spacing:.08em">NEW</span>';
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('sonara:open-remix')));
  }

  copyButtonLook(creator, button);
  if (creator.nextElementSibling !== button) creator.insertAdjacentElement('afterend', button);
}

function setYoutubeMode(sourcePanel: HTMLElement, active: boolean) {
  sourcePanel.dataset.sonaraRemixYoutubeModeV2 = active ? 'true' : 'false';
  const library = sourcePanel.querySelector<HTMLElement>('.sonara-remix-library');
  const upload = sourcePanel.querySelector<HTMLElement>('.sonara-remix-upload');
  const editor = sourcePanel.querySelector<HTMLElement>('.sonara-remix-editor');
  const panel = sourcePanel.querySelector<HTMLElement>(`[${YOUTUBE_PANEL}]`);
  [library, upload, editor].forEach(node => { if (node) node.style.display = active ? 'none' : ''; });
  if (panel) panel.style.display = active ? 'block' : 'none';

  sourcePanel.querySelectorAll<HTMLButtonElement>('.sonara-remix-source-tabs button').forEach(button => {
    const isYoutube = button.hasAttribute(YOUTUBE_TAB);
    if (isYoutube) button.dataset.active = active ? 'true' : 'false';
    else if (active) button.dataset.active = 'false';
  });
}

function appendReferenceToPrompt(url: string, videoId: string) {
  const prompt = document.querySelector<HTMLTextAreaElement>('.sonara-remix-prompt-box textarea');
  if (!prompt) return;
  const marker = 'YouTube reference autorizzata:';
  const note = `${marker} ${url}. Usa solo vibe, energia, palette sonora e direzione creativa; non copiare letteralmente melodia, testo o arrangiamento.`;
  const next = prompt.value.includes(marker)
    ? prompt.value.replace(/YouTube reference autorizzata:[^\n]*/i, note)
    : `${prompt.value.trim()}\n${note}`.trim();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(prompt, next);
  else prompt.value = next;
  prompt.dispatchEvent(new Event('input', { bubbles: true }));
  window.dispatchEvent(new CustomEvent('sonara:remix-youtube-reference-selected', { detail: { url, videoId } }));
}

function installYoutubeSource() {
  const tabs = document.querySelector<HTMLElement>('.sonara-remix-source-tabs');
  if (!tabs) return;
  const sourcePanel = tabs.closest<HTMLElement>('.sonara-remix-source-panel');
  if (!sourcePanel) return;

  let tab = tabs.querySelector<HTMLButtonElement>(`button[${YOUTUBE_TAB}]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute(YOUTUBE_TAB, 'true');
    tab.dataset.active = 'false';
    tab.innerHTML = '<span aria-hidden="true" style="font-size:14px;line-height:1">▶</span>YouTube link';
    tab.addEventListener('click', () => setYoutubeMode(sourcePanel, true));
    tabs.appendChild(tab);
  }

  if (!tabs.dataset.sonaraYoutubeTabListeners) {
    tabs.dataset.sonaraYoutubeTabListeners = 'true';
    tabs.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (button && !button.hasAttribute(YOUTUBE_TAB)) setYoutubeMode(sourcePanel, false);
    });
  }

  let panel = sourcePanel.querySelector<HTMLElement>(`[${YOUTUBE_PANEL}]`);
  if (panel) return;
  panel = document.createElement('div');
  panel.setAttribute(YOUTUBE_PANEL, 'true');
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="sonara-remix-youtube-v2">
      <div class="sonara-remix-youtube-v2-title"><span>▶</span><div><strong>YouTube reference</strong><small>Incolla un link e usalo come riferimento creativo autorizzato</small></div></div>
      <div class="sonara-remix-youtube-v2-row"><input data-youtube-url type="url" placeholder="https://www.youtube.com/watch?v=..." spellcheck="false"><button data-youtube-load type="button">Load</button></div>
      <div data-youtube-preview class="sonara-remix-youtube-v2-preview"><div class="sonara-remix-youtube-v2-empty"><span>▶</span><strong>Paste a YouTube link</strong><small>Supporta youtube.com, youtu.be, Shorts e Live.</small></div></div>
      <label class="sonara-remix-youtube-v2-rights"><input data-youtube-rights type="checkbox"><span><strong>Confermo di possedere i diritti o l’autorizzazione</strong><small>Il link guida la reference. Per audio-to-audio reale usa il file originale/autorizzato.</small></span></label>
      <div data-youtube-message class="sonara-remix-youtube-v2-message"></div>
      <div class="sonara-remix-youtube-v2-actions"><button data-youtube-upload type="button">Upload audio autorizzato</button><button data-youtube-use type="button">Usa come reference</button></div>
    </div>`;
  tabs.insertAdjacentElement('afterend', panel);

  const input = panel.querySelector<HTMLInputElement>('[data-youtube-url]')!;
  const rights = panel.querySelector<HTMLInputElement>('[data-youtube-rights]')!;
  const preview = panel.querySelector<HTMLElement>('[data-youtube-preview]')!;
  const message = panel.querySelector<HTMLElement>('[data-youtube-message]')!;
  const load = panel.querySelector<HTMLButtonElement>('[data-youtube-load]')!;
  const use = panel.querySelector<HTMLButtonElement>('[data-youtube-use]')!;
  const upload = panel.querySelector<HTMLButtonElement>('[data-youtube-upload]')!;

  try {
    const saved = JSON.parse(localStorage.getItem(YOUTUBE_STORE) || 'null');
    if (saved?.url) input.value = String(saved.url);
  } catch {
    // Optional persistence only.
  }

  const renderPreview = () => {
    const value = input.value.trim();
    const id = youtubeVideoId(value);
    if (!id) {
      message.textContent = 'Inserisci un link YouTube valido.';
      preview.innerHTML = '<div class="sonara-remix-youtube-v2-empty"><span>▶</span><strong>Link non valido</strong><small>Controlla il link e riprova.</small></div>';
      return '';
    }
    preview.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0" title="YouTube reference" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    message.textContent = 'Link riconosciuto. Conferma i diritti prima di usarlo come reference.';
    return id;
  };

  load.addEventListener('click', renderPreview);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); renderPreview(); } });

  use.addEventListener('click', () => {
    const value = input.value.trim();
    const id = youtubeVideoId(value);
    if (!id) {
      message.textContent = 'Inserisci prima un link YouTube valido.';
      return;
    }
    if (!rights.checked) {
      message.textContent = 'Conferma di possedere i diritti o l’autorizzazione.';
      return;
    }
    try { localStorage.setItem(YOUTUBE_STORE, JSON.stringify({ url: value, videoId: id })); } catch { /* optional */ }
    appendReferenceToPrompt(value, id);
    message.textContent = 'Reference YouTube collegata al Prompt Remix.';
  });

  upload.addEventListener('click', () => {
    setYoutubeMode(sourcePanel, false);
    const uploadTab = Array.from(tabs.querySelectorAll<HTMLButtonElement>('button')).find(button => /upload audio/i.test(button.textContent || ''));
    uploadTab?.click();
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.sonara-remix-upload input[type="file"]')?.click(), 100);
  });
}

function installStyles() {
  if (document.getElementById('sonara-remix-access-v2-style')) return;
  const style = document.createElement('style');
  style.id = 'sonara-remix-access-v2-style';
  style.textContent = `
    button[${SIDEBAR_ENTRY}]{position:relative!important}
    .sonara-remix-youtube-v2{margin:10px 16px 16px;padding:13px;border:1px solid rgba(255,255,255,.065);border-radius:13px;background:#0c0c10;color:#eeeef2}
    .sonara-remix-youtube-v2-title{display:flex;align-items:center;gap:9px;margin-bottom:10px}.sonara-remix-youtube-v2-title>span{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:rgba(239,68,68,.09);color:#fb7185}.sonara-remix-youtube-v2-title strong{display:block;font-size:10px}.sonara-remix-youtube-v2-title small{display:block;margin-top:3px;color:#666672;font-size:8px}
    .sonara-remix-youtube-v2-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.sonara-remix-youtube-v2-row input{height:38px;min-width:0;padding:0 10px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101015;color:#fff;outline:0;font-size:9px}.sonara-remix-youtube-v2-row button{padding:0 13px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#19191f;color:#d6d6dc;font-size:8px;font-weight:900;cursor:pointer}
    .sonara-remix-youtube-v2-preview{margin-top:9px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#08080b}.sonara-remix-youtube-v2-preview iframe{display:block;width:100%;aspect-ratio:16/9;border:0}.sonara-remix-youtube-v2-empty{min-height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#60606b}.sonara-remix-youtube-v2-empty>span{font-size:22px;color:#7d3d47}.sonara-remix-youtube-v2-empty strong{margin-top:7px;color:#9a9aa4;font-size:9px}.sonara-remix-youtube-v2-empty small{margin-top:3px;font-size:7px}
    .sonara-remix-youtube-v2-rights{margin-top:9px;padding:9px;display:flex;gap:8px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:#111116;cursor:pointer}.sonara-remix-youtube-v2-rights input{margin-top:2px;accent-color:#7c3aed}.sonara-remix-youtube-v2-rights strong{display:block;font-size:8px}.sonara-remix-youtube-v2-rights small{display:block;margin-top:3px;color:#62626d;font-size:7px;line-height:1.4}.sonara-remix-youtube-v2-message{min-height:17px;margin-top:8px;color:#a99ec8;font-size:7px;line-height:1.45}
    .sonara-remix-youtube-v2-actions{margin-top:7px;display:grid;grid-template-columns:1fr 1fr;gap:7px}.sonara-remix-youtube-v2-actions button{min-height:36px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#15151a;color:#aaaab3;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-youtube-v2-actions button:last-child{border-color:rgba(167,139,250,.2);background:linear-gradient(135deg,rgba(91,33,182,.25),rgba(37,99,235,.12));color:#d9cdff}
    @media(max-width:680px){.sonara-remix-youtube-v2-actions{grid-template-columns:1fr}.sonara-remix-youtube-v2-row{grid-template-columns:1fr}.sonara-remix-youtube-v2-row button{min-height:36px}}
  `;
  document.head.appendChild(style);
}

export default function SonaraRemixAccessBridgeV2() {
  useEffect(() => {
    let scheduled = false;
    const scan = () => {
      scheduled = false;
      installStyles();
      installSidebarEntry();
      installYoutubeSource();
    };
    const requestScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    };
    scan();
    const observer = new MutationObserver(requestScan);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(scan, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelectorAll(`[${SIDEBAR_ENTRY}],[${YOUTUBE_TAB}],[${YOUTUBE_PANEL}]`).forEach(node => node.remove());
      document.getElementById('sonara-remix-access-v2-style')?.remove();
    };
  }, []);
  return null;
}
