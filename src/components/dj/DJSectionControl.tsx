import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Disc3, X, Zap } from 'lucide-react';
import NIMinimalConsole from './NIMinimalConsole';
import SonaraProLiveSkin from './SonaraProLiveSkin';

const NAV_HOST_ID = 'sonara-dj-nav-host';

export default function DJSectionControl() {
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mountNav = () => {
      const aside = document.querySelector('aside');
      if (!(aside instanceof HTMLElement)) return;
      let host = document.getElementById(NAV_HOST_ID);
      if (!host) {
        host = document.createElement('div');
        host.id = NAV_HOST_ID;
        host.dataset.sonaraDjNav = 'true';
        const studioHost = document.getElementById('sonara-studio-nav-host');
        if (studioHost?.nextSibling) aside.insertBefore(host, studioHost.nextSibling);
        else if (studioHost) aside.appendChild(host);
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
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const overlay = useMemo(() => !open ? null : (
    <div className="fixed inset-0 z-[2147481900] overflow-auto bg-[#03050a] text-slate-100" data-sonara-dj-section="true">
      <div className="sticky top-0 z-50 border-b border-slate-900 bg-[#03050a]/96 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10"><Disc3 className="h-4 w-4 text-cyan-300" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="truncate text-sm font-black text-white">SONARA DJ PRO</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[7px] font-black tracking-wider text-emerald-300">PRO LIVE</span></div>
              <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-600">Native 2 Deck · X1 MK2 + Z1 MK2 · Real Web Audio</div>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-white" aria-label="Chiudi SONARA DJ PRO"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mx-auto max-w-[1800px] space-y-4 p-3 sm:p-5">
        <NIMinimalConsole />
        <SonaraProLiveSkin />
      </div>
    </div>
  ), [open]);

  const floatingAccess = !open ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed bottom-5 right-5 z-[2147481700] flex items-center gap-3 rounded-2xl border border-cyan-400/25 bg-[#080b13]/95 px-4 py-3 text-left shadow-2xl shadow-black/50 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/50 sm:bottom-6 sm:right-6"
      aria-label="Apri SONARA DJ PRO"
      data-sonara-dj-floating-access="true"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15"><Disc3 className="h-5 w-5 text-cyan-300" /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[11px] font-black text-white">DJ PRO <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[7px] tracking-wider text-emerald-300">PRO LIVE</span></span>
        <span className="mt-0.5 block text-[8px] font-bold text-slate-500">Deck A · Mixer · Deck B</span>
      </span>
      <Zap className="h-4 w-4 text-cyan-300" />
    </button>
  ) : null;

  return (
    <>
      {navHost && createPortal(
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-left text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/10" aria-label="Apri SONARA DJ PRO">
          <span className="relative"><Disc3 className="h-4 w-4 text-cyan-300" /><span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
          DJ PRO
          <span className="ml-auto rounded-full border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-slate-400">PRO LIVE</span>
        </button>, navHost
      )}
      {floatingAccess && createPortal(floatingAccess, document.body)}
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
