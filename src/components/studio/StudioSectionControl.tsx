import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  FileAudio2,
  Focus,
  Gauge,
  KeyboardMusic,
  Layers3,
  Music2,
  PanelBottomClose,
  PanelBottomOpen,
  Save,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react';
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
  const [focusMode, setFocusMode] = useState(true);
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
    setFocusMode(true);

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

  const getStudioRoot = () => document.querySelector('[data-sonara-studio-section="true"] .sonara-pro-studio');

  const triggerImport = (kind: 'audio' | 'stems' | 'midi') => {
    const inputs = Array.from(getStudioRoot()?.querySelectorAll('input[type="file"]') || []) as HTMLInputElement[];
    const index = kind === 'audio' ? 0 : kind === 'stems' ? 1 : 2;
    inputs[index]?.click();
  };

  const clickInternalAction = (pattern: RegExp) => {
    const buttons = Array.from(getStudioRoot()?.querySelectorAll('button') || []) as HTMLButtonElement[];
    buttons.find(button => pattern.test((button.textContent || '').trim()))?.click();
  };

  const overlay = useMemo(() => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[2147482000] overflow-auto bg-[#07090d] text-slate-100" data-sonara-studio-section="true">
        <style>{`
          .sonara-pro-studio > div {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #07090d !important;
          }
          .sonara-pro-studio > div > header,
          .sonara-pro-studio > div > footer {
            display: none !important;
          }
          .sonara-pro-studio > div > div {
            min-height: calc(100vh - 132px) !important;
          }
          .sonara-pro-studio > div > div > aside {
            display: none !important;
          }
          .sonara-pro-studio > div > div > main {
            width: 100% !important;
            background: #07090d !important;
          }
          .sonara-pro-studio.is-focus > div > div > main > .grid {
            display: none !important;
          }
          .sonara-pro-studio button,
          .sonara-pro-studio input {
            transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, opacity 140ms ease;
          }
          .sonara-pro-studio > div > div > main > div:first-child {
            background: rgba(8, 11, 18, .92) !important;
            backdrop-filter: blur(16px);
          }
          @media (max-width: 640px) {
            .sonara-pro-studio > div > div {
              min-height: calc(100vh - 176px) !important;
            }
          }
        `}</style>

        <header className="sticky top-0 z-[60] border-b border-white/[0.07] bg-[#07090d]/95 backdrop-blur-2xl">
          <div className="flex min-h-16 items-center gap-3 px-3 sm:px-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white text-black">
              <Music2 className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">SONARA Studio Pro</span>
                <span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-2 py-0.5 text-[8px] font-bold text-emerald-300 sm:inline">48 kHz · 32-bit</span>
              </div>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="mt-0.5 w-full max-w-xl truncate bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-700"
                aria-label="Nome progetto Studio"
              />
            </div>

            <div className="hidden items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1 md:flex">
              <div className="flex items-center gap-2 px-2 text-[10px] font-semibold text-slate-400">
                <Gauge className="h-3.5 w-3.5" />
                <input
                  type="number"
                  min={40}
                  max={220}
                  value={bpm}
                  onChange={event => {
                    const value = Math.max(40, Math.min(220, Number(event.target.value) || DEFAULT_BPM));
                    setBpm(value);
                    window.localStorage.setItem('sonara.preferredBpm', String(value));
                  }}
                  className="w-12 bg-transparent text-center font-mono text-[11px] font-bold text-white outline-none"
                  aria-label="BPM"
                />
                <span className="text-[8px] uppercase tracking-wider text-slate-600">BPM</span>
              </div>
              <div className="h-5 w-px bg-white/[0.07]" />
              <div className="px-2 text-[10px] font-semibold text-slate-300">A Minor</div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white"
              aria-label="Chiudi Studio"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.05] px-3 py-2 sm:px-5">
            <div className="mr-1 hidden items-center gap-1.5 pr-2 text-[8px] font-black uppercase tracking-[0.18em] text-slate-700 sm:flex">
              <Sparkles className="h-3 w-3" /> Session
            </div>

            <button type="button" onClick={() => triggerImport('audio')} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">
              <FileAudio2 className="h-3.5 w-3.5" /> Audio
            </button>
            <button type="button" onClick={() => triggerImport('stems')} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">
              <Layers3 className="h-3.5 w-3.5" /> Stems
            </button>
            <button type="button" onClick={() => triggerImport('midi')} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">
              <KeyboardMusic className="h-3.5 w-3.5" /> MIDI
            </button>

            <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.07]" />

            <button type="button" onClick={() => setFocusMode(value => !value)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold ${focusMode ? 'bg-white text-black' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'}`}>
              {focusMode ? <PanelBottomOpen className="h-3.5 w-3.5" /> : <PanelBottomClose className="h-3.5 w-3.5" />}
              {focusMode ? 'Mixer' : 'Focus'}
            </button>
            <button type="button" onClick={() => openExistingSection(/produzione|production/i)} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Mix / Master
            </button>

            <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.07]" />

            <button type="button" onClick={() => clickInternalAction(/^SALVA$/i)} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">
              <Save className="h-3.5 w-3.5" /> Salva
            </button>
            <button type="button" onClick={() => clickInternalAction(/Full mix.*32-bit.*48 kHz/i)} className="flex shrink-0 items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.08] px-3 py-2 text-[10px] font-bold text-violet-200 hover:bg-violet-400/[0.14]">
              <Download className="h-3.5 w-3.5" /> Export WAV Pro
            </button>

            <div className="ml-auto hidden shrink-0 items-center gap-2 pl-3 text-[9px] font-medium text-slate-600 lg:flex">
              <Focus className="h-3.5 w-3.5" /> Editing non distruttivo
            </div>
          </div>
        </header>

        <div className={`sonara-pro-studio ${focusMode ? 'is-focus' : ''}`}>
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
  }, [open, audioUrl, title, bpm, focusMode]);

  return (
    <>
      {navHost && createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-left text-sm font-semibold text-slate-200 transition hover:border-white/15 hover:bg-white/[0.05]"
          aria-label="Apri SONARA Studio"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black transition group-hover:scale-[1.03]">
            <Music2 className="h-3.5 w-3.5" />
          </div>
          <span>Studio</span>
          <span className="ml-auto rounded-md border border-emerald-400/15 bg-emerald-400/[0.07] px-1.5 py-0.5 text-[8px] font-black tracking-wider text-emerald-300">PRO</span>
        </button>,
        navHost
      )}
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
