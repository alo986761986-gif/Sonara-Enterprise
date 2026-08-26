import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Disc3, Headphones, Radio, SlidersHorizontal, Usb, X, Zap } from 'lucide-react';
import DJConnectHub from './DJConnectHub';
import DJDeckSkinManager from './DJDeckSkinManager';

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
    <div className="fixed inset-0 z-[2147481900] overflow-auto bg-[#05070c] text-slate-100" data-sonara-dj-section="true">
      <div className="sticky top-0 z-50 border-b border-slate-800 bg-[#05070c]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-600 shadow-lg shadow-purple-950/30"><Disc3 className="h-5 w-5 text-white" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-black text-white">SONARA DJ PRO</span><span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black tracking-wider text-emerald-300">LIVE WORKSPACE</span></div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Hardware · Mixer · Mapping · Audio · Network · Diagnostics</div>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:border-rose-500/40 hover:text-rose-300" aria-label="Chiudi SONARA DJ PRO"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-slate-900 px-3 py-2 sm:px-5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1.5 text-[8px] font-black text-fuchsia-200"><Disc3 className="h-3 w-3" />2 DECK LIVE</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5 text-[8px] font-black text-purple-200"><SlidersHorizontal className="h-3 w-3" />MIDI LEARN</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1.5 text-[8px] font-black text-cyan-200"><Usb className="h-3 w-3" />MIDI / HID / BRIDGE</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[8px] font-black text-emerald-200"><Headphones className="h-3 w-3" />AUDIO ROUTING</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[8px] font-black text-amber-200"><Radio className="h-3 w-3" />ABLETON LINK</span>
        </div>
      </div>
      <div className="mx-auto max-w-[1700px] p-3 sm:p-5"><div className="space-y-5"><DJDeckSkinManager profileId="all-controllers" profileName="Console collegata / Browser" /><DJConnectHub /></div></div>
    </div>
  ), [open]);

  const floatingAccess = !open ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed bottom-5 right-5 z-[2147481700] flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-[#080b13]/95 px-4 py-3 text-left shadow-2xl shadow-black/50 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/60 sm:bottom-6 sm:right-6"
      aria-label="Apri SONARA DJ PRO"
      data-sonara-dj-floating-access="true"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-600"><Disc3 className="h-5 w-5 text-white" /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[11px] font-black text-white">DJ PRO <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[7px] tracking-wider text-emerald-300">LIVE</span></span>
        <span className="mt-0.5 block text-[8px] font-bold text-slate-500">Mixer · Hardware · Bridge</span>
      </span>
      <Zap className="h-4 w-4 text-cyan-300" />
    </button>
  ) : null;

  return (
    <>
      {navHost && createPortal(
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-fuchsia-500/12 via-purple-500/12 to-cyan-500/12 px-4 py-3 text-left text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/60 hover:from-fuchsia-500/20 hover:to-cyan-500/20" aria-label="Apri SONARA DJ PRO">
          <span className="relative"><Disc3 className="h-4 w-4 text-cyan-300" /><span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
          DJ PRO
          <span className="ml-auto rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-emerald-300">LIVE</span>
        </button>, navHost
      )}
      {floatingAccess && createPortal(floatingAccess, document.body)}
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
