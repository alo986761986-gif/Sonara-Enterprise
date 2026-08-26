import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Disc3, X } from 'lucide-react';
import DJConnectHub from './DJConnectHub';

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
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-slate-800 bg-[#05070c]/95 px-3 py-2 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-600 shadow-lg shadow-purple-950/30"><Disc3 className="h-4 w-4 text-white" /></div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-white">SONARA DJ</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Universal DJ hardware connection hub</div>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:border-rose-500/40 hover:text-rose-300" aria-label="Chiudi SONARA DJ"><X className="h-4 w-4" /></button>
      </div>
      <div className="mx-auto max-w-[1700px] p-3 sm:p-5"><DJConnectHub /></div>
    </div>
  ), [open]);

  return (
    <>
      {navHost && createPortal(
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-cyan-500/25 bg-gradient-to-r from-fuchsia-500/10 via-purple-500/10 to-cyan-500/10 px-4 py-3 text-left text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:from-fuchsia-500/15 hover:to-cyan-500/15" aria-label="Apri SONARA DJ">
          <Disc3 className="h-4 w-4 text-cyan-300" />
          DJ
          <span className="ml-auto rounded-full border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-cyan-200">NEW</span>
        </button>, navHost
      )}
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
