import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music2, X } from 'lucide-react';
import SonaraStudio from './SonaraStudio';

const NAV_HOST_ID = 'sonara-studio-nav-host';
const DEFAULT_BPM = 124;

function storedBpm() {
  const value = Number(window.localStorage.getItem('sonara.preferredBpm'));
  return Number.isFinite(value) ? Math.max(40, Math.min(220, Math.round(value))) : DEFAULT_BPM;
}

export default function StudioSectionControl() {
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [bpm, setBpm] = useState(storedBpm);
  const [audioUrl, setAudioUrl] = useState('');
  const [title, setTitle] = useState('SONARA Studio Project');

  useEffect(() => {
    const mountNav = () => {
      const aside = document.querySelector('aside');
      if (!(aside instanceof HTMLElement)) return;
      let host = document.getElementById(NAV_HOST_ID);
      if (!host) {
        host = document.createElement('div');
        host.id = NAV_HOST_ID;
        const buttons = Array.from(aside.querySelectorAll(':scope > button'));
        const generatorButton = buttons.find(button => /generatore|generator/i.test(button.textContent || ''));
        if (generatorButton?.nextSibling) aside.insertBefore(host, generatorButton.nextSibling);
        else aside.prepend(host);
      }
      setNavHost(host);
    };

    mountNav();
    const timer = window.setInterval(mountNav, 900);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const liveAudio = document.querySelector('audio[src]') as HTMLAudioElement | null;
    if (liveAudio?.src) setAudioUrl(liveAudio.src);
    setBpm(storedBpm());

    const titleInput = Array.from(document.querySelectorAll('input')).find(input => {
      const value = (input as HTMLInputElement).value;
      return /sonara/i.test(value || '') && value.length < 120;
    }) as HTMLInputElement | undefined;
    if (titleInput?.value) setTitle(titleInput.value);

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openExistingSection = (pattern: RegExp) => {
    setOpen(false);
    window.setTimeout(() => {
      const button = Array.from(document.querySelectorAll('aside button')).find(candidate => pattern.test(candidate.textContent || '')) as HTMLButtonElement | undefined;
      button?.click();
    }, 0);
  };

  const overlay = useMemo(() => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[2147482000] overflow-auto bg-[#05070c] text-slate-100" data-sonara-studio-section="true">
        <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-slate-800 bg-[#05070c]/95 px-3 py-2 backdrop-blur-xl sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-600">
              <Music2 className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-white">SONARA Studio</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Multitrack generative workstation</div>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:border-rose-500/40 hover:text-rose-300" aria-label="Chiudi Studio">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-2 sm:p-4">
          <SonaraStudio
            audioUrl={audioUrl}
            title={title}
            bpm={bpm}
            keySignature="A Minor"
            onBpmChange={value => {
              setBpm(value);
              window.localStorage.setItem('sonara.preferredBpm', String(value));
            }}
            onOpenMarket={() => openExistingSection(/marketplace|music market/i)}
            onOpenProduction={() => openExistingSection(/produzione|production/i)}
          />
        </div>
      </div>
    );
  }, [open, audioUrl, title, bpm]);

  return (
    <>
      {navHost && createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-purple-500/25 bg-gradient-to-r from-fuchsia-500/10 via-purple-500/10 to-indigo-500/10 px-4 py-3 text-left text-sm font-semibold text-purple-100 transition hover:border-purple-400/50 hover:from-fuchsia-500/15 hover:to-indigo-500/15"
          aria-label="Apri SONARA Studio"
        >
          <Music2 className="h-4 w-4 text-fuchsia-300" />
          Studio
          <span className="ml-auto rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-fuchsia-200">NEW</span>
        </button>,
        navHost
      )}
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
