import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AudioWaveform, CheckCircle2, Link2, UploadCloud, Youtube } from 'lucide-react';

const YOUTUBE_STORE = 'sonara.remix.youtubeReference.v1';

type YoutubeReference = {
  url: string;
  videoId: string;
  title?: string;
  author?: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function findMainSidebar(): HTMLElement | null {
  return Array.from(document.querySelectorAll('aside')).find(candidate => {
    const text = normalize(candidate.textContent || '');
    return /(panoramica|overview)/i.test(text) && /(crea la mia musica|generatore|generator)/i.test(text);
  }) as HTMLElement | null;
}

function findCreatorButton(aside: HTMLElement | null): HTMLButtonElement | null {
  if (!aside) return null;
  return Array.from(aside.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    const text = normalize(button.textContent || '');
    return /^(crea la mia musica|generatore|generator)\b/i.test(text);
  }) || null;
}

function youtubeId(value: string): string {
  const text = value.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return (url.pathname.split('/').filter(Boolean)[0] || '').slice(0, 32);
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') return (url.searchParams.get('v') || '').slice(0, 32);
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0] || '')) return (parts[1] || '').slice(0, 32);
    }
  } catch {
    return '';
  }
  return '';
}

function readStoredReference(): YoutubeReference | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(YOUTUBE_STORE) || 'null');
    if (parsed?.url && parsed?.videoId) return parsed as YoutubeReference;
  } catch {
    // Local storage is optional.
  }
  return null;
}

export default function SonaraRemixAccessBridge() {
  const [sidebarHost, setSidebarHost] = useState<HTMLElement | null>(null);
  const [youtubeTabHost, setYoutubeTabHost] = useState<HTMLElement | null>(null);
  const [youtubePanelHost, setYoutubePanelHost] = useState<HTMLElement | null>(null);
  const [youtubeMode, setYoutubeMode] = useState(false);
  const [url, setUrl] = useState(() => readStoredReference()?.url || '');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [metadata, setMetadata] = useState<YoutubeReference | null>(readStoredReference);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const videoId = useMemo(() => youtubeId(url), [url]);
  const embedUrl = videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0` : '';

  useEffect(() => {
    let scheduled = false;

    const scan = () => {
      scheduled = false;
      const aside = findMainSidebar();
      const creator = findCreatorButton(aside);
      if (creator) {
        let host = aside?.querySelector<HTMLElement>('[data-sonara-remix-sidebar-host]') || null;
        if (!host) {
          host = document.createElement('span');
          host.dataset.sonaraRemixSidebarHost = 'true';
          host.style.display = 'contents';
          creator.insertAdjacentElement('afterend', host);
        }
        setSidebarHost(current => current === host ? current : host);
      }

      const tabs = document.querySelector('.sonara-remix-source-tabs') as HTMLElement | null;
      if (tabs) {
        let tabHost = tabs.querySelector<HTMLElement>('[data-sonara-remix-youtube-tab-host]');
        if (!tabHost) {
          tabHost = document.createElement('span');
          tabHost.dataset.sonaraRemixYoutubeTabHost = 'true';
          tabHost.style.display = 'contents';
          tabs.appendChild(tabHost);
        }
        setYoutubeTabHost(current => current === tabHost ? current : tabHost);

        const sourcePanel = tabs.closest('.sonara-remix-source-panel') as HTMLElement | null;
        if (sourcePanel) {
          let panelHost = sourcePanel.querySelector<HTMLElement>('[data-sonara-remix-youtube-panel-host]');
          if (!panelHost) {
            panelHost = document.createElement('div');
            panelHost.dataset.sonaraRemixYoutubePanelHost = 'true';
            tabs.insertAdjacentElement('afterend', panelHost);
          }
          setYoutubePanelHost(current => current === panelHost ? current : panelHost);
          sourcePanel.toggleAttribute('data-sonara-remix-youtube-mode', youtubeMode);
        }
      } else {
        setYoutubeTabHost(null);
        setYoutubePanelHost(null);
      }
    };

    const requestScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    };

    scan();
    const observer = new MutationObserver(requestScan);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(requestScan, 900);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelectorAll('[data-sonara-remix-sidebar-host],[data-sonara-remix-youtube-tab-host],[data-sonara-remix-youtube-panel-host]').forEach(node => node.remove());
      document.querySelectorAll('[data-sonara-remix-youtube-mode]').forEach(node => node.removeAttribute('data-sonara-remix-youtube-mode'));
    };
  }, [youtubeMode]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('.sonara-remix-source-tabs button') : null;
      if (!target) return;
      if (!target.closest('[data-sonara-remix-youtube-tab-host]')) setYoutubeMode(false);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const loadYoutube = async () => {
    setMessage('');
    if (!videoId) {
      setMetadata(null);
      setMessage('Inserisci un link YouTube valido.');
      return;
    }
    setLoading(true);
    const base: YoutubeReference = { url: url.trim(), videoId };
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const next = { ...base, title: String(data?.title || '').trim(), author: String(data?.author_name || '').trim() };
      setMetadata(next);
      setMessage('Link YouTube riconosciuto. Conferma i diritti per usarlo come reference creativa.');
    } catch {
      setMetadata(base);
      setMessage('Link YouTube riconosciuto. Anteprima disponibile; i metadati non sono stati caricati.');
    } finally {
      setLoading(false);
    }
  };

  const useReference = () => {
    const next = metadata?.videoId === videoId ? metadata : videoId ? { url: url.trim(), videoId } : null;
    if (!next) {
      setMessage('Inserisci prima un link YouTube valido.');
      return;
    }
    if (!rightsConfirmed) {
      setMessage('Conferma di possedere i diritti o l’autorizzazione per usare questo contenuto come riferimento.');
      return;
    }

    try { window.localStorage.setItem(YOUTUBE_STORE, JSON.stringify(next)); } catch { /* optional */ }
    setMetadata(next);

    const prompt = document.querySelector<HTMLTextAreaElement>('.sonara-remix-prompt-box textarea');
    if (prompt) {
      const label = next.title ? `“${next.title}”${next.author ? ` di ${next.author}` : ''}` : 'il link YouTube autorizzato';
      const note = ` Usa ${label} come riferimento creativo autorizzato ad alto livello; preserva originalità, evita copie letterali di melodia, testo o arrangiamento.`;
      if (!prompt.value.includes('riferimento creativo autorizzato')) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        const value = `${prompt.value.trim()}${note}`.trim();
        if (setter) setter.call(prompt, value);
        else prompt.value = value;
        prompt.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    window.dispatchEvent(new CustomEvent('sonara:remix-youtube-reference-selected', { detail: next }));
    setMessage('Reference YouTube salvata. Per l’audio-to-audio reale usa il file originale/autorizzato tramite Upload audio.');
  };

  const openAuthorizedUpload = () => {
    const tabs = document.querySelector('.sonara-remix-source-tabs');
    const uploadButton = tabs ? Array.from(tabs.querySelectorAll<HTMLButtonElement>('button')).find(button => /upload audio/i.test(button.textContent || '')) : null;
    setYoutubeMode(false);
    uploadButton?.click();
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.sonara-remix-upload input[type="file"]')?.click(), 120);
  };

  const sidebar = sidebarHost ? createPortal(
    <button
      type="button"
      data-sonara-remix-sidebar-entry="true"
      className={findCreatorButton(findMainSidebar())?.className || 'w-full'}
      onClick={() => window.dispatchEvent(new CustomEvent('sonara:open-remix'))}
      title="Apri SONARA Remix"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true"><AudioWaveform className="h-[19px] w-[19px] stroke-[1.8] text-violet-300" /></span>
      <span>Remix</span>
    </button>,
    sidebarHost
  ) : null;

  const youtubeTab = youtubeTabHost ? createPortal(
    <button type="button" data-active={youtubeMode} onClick={() => setYoutubeMode(true)}><Youtube />YouTube link</button>,
    youtubeTabHost
  ) : null;

  const youtubePanel = youtubePanelHost ? createPortal(
    <div className="sonara-remix-youtube-panel" data-visible={youtubeMode}>
      <div className="sonara-remix-youtube-input-row">
        <span><Link2 /></span>
        <input value={url} onChange={event => { setUrl(event.target.value); setMessage(''); }} placeholder="https://www.youtube.com/watch?v=…" spellCheck={false} />
        <button type="button" onClick={() => void loadYoutube()} disabled={loading}>{loading ? 'Checking…' : 'Load'}</button>
      </div>

      {embedUrl ? (
        <div className="sonara-remix-youtube-preview">
          <iframe src={embedUrl} title={metadata?.title || 'YouTube reference'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          <div><Youtube /><span><strong>{metadata?.title || 'YouTube reference'}</strong><small>{metadata?.author || `Video ID ${videoId}`}</small></span></div>
        </div>
      ) : (
        <div className="sonara-remix-youtube-placeholder"><Youtube /><strong>Paste a YouTube link</strong><small>Visualizza il video e usalo come reference creativa autorizzata.</small></div>
      )}

      <label className="sonara-remix-youtube-rights">
        <input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} />
        <span><strong>Confermo di possedere i diritti o l’autorizzazione</strong><small>SONARA non estrae automaticamente audio protetto da YouTube.</small></span>
      </label>

      {message && <div className="sonara-remix-youtube-message">{message}</div>}

      <div className="sonara-remix-youtube-actions">
        <button type="button" className="is-secondary" onClick={openAuthorizedUpload}><UploadCloud />Upload audio autorizzato</button>
        <button type="button" className="is-primary" onClick={useReference} disabled={!videoId || !rightsConfirmed}><CheckCircle2 />Usa come reference</button>
      </div>
    </div>,
    youtubePanelHost
  ) : null;

  return (
    <>
      {sidebar}
      {youtubeTab}
      {youtubePanel}
      <style>{`
        [data-sonara-remix-sidebar-entry="true"]{position:relative!important}
        [data-sonara-remix-sidebar-entry="true"]::after{content:'NEW';margin-left:auto;padding:3px 5px;border:1px solid rgba(167,139,250,.18);border-radius:6px;background:rgba(124,58,237,.08);color:#a78bfa;font-size:7px;font-weight:950;letter-spacing:.08em}
        .sonara-remix-source-tabs>[data-sonara-remix-youtube-tab-host]{display:contents!important}
        .sonara-remix-source-tabs [data-sonara-remix-youtube-tab-host] button{display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid transparent;border-radius:10px;background:transparent;color:#777782;font-size:9px;font-weight:900;cursor:pointer}
        .sonara-remix-source-tabs [data-sonara-remix-youtube-tab-host] button svg{width:13px}
        .sonara-remix-source-tabs [data-sonara-remix-youtube-tab-host] button[data-active="true"]{border-color:rgba(255,255,255,.075);background:#18181e;color:#fff}
        [data-sonara-remix-youtube-panel-host]{display:none}
        .sonara-remix-source-panel[data-sonara-remix-youtube-mode]>.sonara-remix-library,.sonara-remix-source-panel[data-sonara-remix-youtube-mode]>.sonara-remix-upload,.sonara-remix-source-panel[data-sonara-remix-youtube-mode]>.sonara-remix-editor{display:none!important}
        .sonara-remix-source-panel[data-sonara-remix-youtube-mode]>[data-sonara-remix-youtube-panel-host]{display:block!important}
        .sonara-remix-youtube-panel{display:none;padding:10px 16px 16px}.sonara-remix-youtube-panel[data-visible="true"]{display:block}
        .sonara-remix-youtube-input-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:7px;align-items:center;padding:7px;border:1px solid rgba(255,255,255,.065);border-radius:12px;background:#0c0c10}
        .sonara-remix-youtube-input-row>span{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:rgba(239,68,68,.08);color:#fb7185}.sonara-remix-youtube-input-row svg{width:14px}
        .sonara-remix-youtube-input-row input{min-width:0;height:34px;padding:0 8px;border:0;outline:0;background:transparent;color:#eeeef2;font-size:9px}
        .sonara-remix-youtube-input-row button{height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#18181e;color:#d1d1d8;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-youtube-input-row button:disabled{opacity:.45}
        .sonara-remix-youtube-preview{margin-top:9px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:#0b0b0f}.sonara-remix-youtube-preview iframe{display:block;width:100%;aspect-ratio:16/9;border:0;background:#050507}.sonara-remix-youtube-preview>div{display:flex;align-items:center;gap:8px;padding:9px 10px}.sonara-remix-youtube-preview>div>svg{width:14px;color:#fb7185}.sonara-remix-youtube-preview span{min-width:0}.sonara-remix-youtube-preview strong,.sonara-remix-youtube-preview small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-remix-youtube-preview strong{font-size:9px}.sonara-remix-youtube-preview small{margin-top:2px;color:#60606b;font-size:7px}
        .sonara-remix-youtube-placeholder{margin-top:9px;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,.07);border-radius:12px;background:#0b0b0f;color:#585863}.sonara-remix-youtube-placeholder svg{width:23px;color:#7d3d47}.sonara-remix-youtube-placeholder strong{margin-top:8px;color:#9898a2;font-size:9px}.sonara-remix-youtube-placeholder small{margin-top:4px;font-size:7px}
        .sonara-remix-youtube-rights{margin-top:9px;padding:9px 10px;display:flex;align-items:flex-start;gap:8px;border:1px solid rgba(255,255,255,.055);border-radius:10px;background:#101014;cursor:pointer}.sonara-remix-youtube-rights input{margin-top:2px;accent-color:#7c3aed}.sonara-remix-youtube-rights span{min-width:0}.sonara-remix-youtube-rights strong{display:block;color:#b7b7c0;font-size:8px}.sonara-remix-youtube-rights small{display:block;margin-top:3px;color:#62626c;font-size:7px;line-height:1.45}
        .sonara-remix-youtube-message{margin-top:8px;padding:8px 9px;border:1px solid rgba(167,139,250,.11);border-radius:8px;background:rgba(124,58,237,.05);color:#aaa0c9;font-size:7px;line-height:1.5}
        .sonara-remix-youtube-actions{margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:7px}.sonara-remix-youtube-actions button{min-height:36px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:9px;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-youtube-actions button svg{width:12px}.sonara-remix-youtube-actions .is-secondary{border:1px solid rgba(255,255,255,.07);background:#141419;color:#a7a7b0}.sonara-remix-youtube-actions .is-primary{border:1px solid rgba(167,139,250,.2);background:linear-gradient(135deg,rgba(91,33,182,.28),rgba(37,99,235,.13));color:#d8ccff}.sonara-remix-youtube-actions .is-primary:disabled{opacity:.35;cursor:not-allowed}
        @media(max-width:680px){.sonara-remix-source-tabs{overflow:auto}.sonara-remix-youtube-input-row{grid-template-columns:30px minmax(0,1fr)}.sonara-remix-youtube-input-row button{grid-column:1/-1}.sonara-remix-youtube-actions{grid-template-columns:1fr}}
      `}</style>
    </>
  );
}
