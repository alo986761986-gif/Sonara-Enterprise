import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, Download, ShieldCheck, Sparkles } from 'lucide-react';

type Candidate = {
  audioUrl?: string;
  url?: string;
  sonaraRecommended?: boolean;
  releaseEligible?: boolean;
  directorRank?: number;
  sonaraQuality?: {
    professionalScore?: number;
    professionalReleasePassed?: boolean;
    measuredFromRealWav?: boolean;
  };
};

type DirectorResult = {
  jobId?: string;
  metadata?: {
    profile?: string;
    generatedCandidateCount?: number;
    visibleCandidateCount?: number;
    professionalTargetScore?: number;
    bestProfessionalScore?: number;
    releaseReady?: boolean;
    automaticCandidateRanking?: boolean;
    automaticQualityRepair?: boolean;
  };
  candidates?: Candidate[];
};

const HOST_ID = 'sonara-director-result-native-host';

function candidateUrl(candidate: Candidate): string {
  return String(candidate?.audioUrl || candidate?.url || '').trim();
}

function ensureResultHost(): HTMLElement | null {
  const download = document.querySelector<HTMLAnchorElement>('a[download][href]');
  if (!download) return null;
  const completedCard = download.closest('.rounded-2xl');
  if (!completedCard || !completedCard.parentElement) return null;

  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.dataset.sonaraDirectorResultHost = 'true';
    completedCard.insertAdjacentElement('afterend', host);
  }
  return host;
}

function profileLabel(value: unknown): string {
  const profile = String(value || 'quality').toUpperCase();
  return ['FAST', 'QUALITY', 'ULTRA'].includes(profile) ? profile : 'QUALITY';
}

export default function DirectorResultPanel() {
  const [result, setResult] = useState<DirectorResult | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<DirectorResult>).detail;
      if (detail && Array.isArray(detail.candidates) && detail.candidates.length) setResult(detail);
    };
    window.addEventListener('sonara:director-result-v3', onResult as EventListener);
    return () => window.removeEventListener('sonara:director-result-v3', onResult as EventListener);
  }, []);

  useEffect(() => {
    if (!result) return;
    const connect = () => {
      const next = ensureResultHost();
      if (next) setHost(current => current === next ? current : next);
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [result]);

  const candidates = useMemo(() => (result?.candidates || []).filter(candidate => candidateUrl(candidate)).slice(0, 2), [result]);
  if (!result || !host || !candidates.length) return null;

  const metadata = result.metadata || {};
  const profile = profileLabel(metadata.profile);
  const generated = Number(metadata.generatedCandidateCount || candidates.length);
  const visible = Number(metadata.visibleCandidateCount || candidates.length);
  const target = Number(metadata.professionalTargetScore || (profile === 'ULTRA' ? 92 : profile === 'FAST' ? 82 : 88));
  const best = Number(metadata.bestProfessionalScore || candidates[0]?.sonaraQuality?.professionalScore || 0);
  const releaseReady = metadata.releaseReady === true || best >= target;

  return createPortal(
    <section id="sonara-director-result-v3" className="mt-4 overflow-hidden rounded-2xl border border-violet-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,.94),rgba(76,29,149,.16),rgba(30,64,175,.12))] p-5 shadow-xl" aria-label="Risultati SONARA Music Director">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-200"><Sparkles className="h-3.5 w-3.5" />SONARA MUSIC DIRECTOR V3</div>
          <div className="mt-1 text-sm font-black text-white">Selezione professionale A/B</div>
          <div className="mt-1 text-[10px] text-slate-400">{generated} candidati analizzati · {visible} migliori mostrati · ranking automatico</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-[9px] font-black tracking-wider text-violet-200">{profile}</span>
          <span className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-black tracking-wider ${releaseReady ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-300'}`}>
            {releaseReady ? 'RELEASE READY' : `TARGET ${target}+`}
          </span>
          <span className="rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5 text-[9px] font-black text-slate-200">BEST {best.toFixed(1)}/100</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {candidates.map((candidate, index) => {
          const url = candidateUrl(candidate);
          const score = Number(candidate.sonaraQuality?.professionalScore || 0);
          const passed = candidate.releaseEligible === true || candidate.sonaraQuality?.professionalReleasePassed === true || score >= target;
          const rank = Number(candidate.directorRank || index + 1);
          const recommended = candidate.sonaraRecommended === true || rank === 1;
          return (
            <article key={`${result.jobId || 'job'}-${rank}-${url}`} className={`rounded-xl border p-4 ${recommended ? 'border-violet-300/40 bg-violet-500/10' : 'border-white/10 bg-slate-950/45'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${recommended ? 'border-violet-300/30 bg-violet-500/15 text-violet-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
                    {recommended ? <Award className="h-4 w-4" /> : <span className="text-xs font-black">#{rank}</span>}
                  </span>
                  <div>
                    <div className="text-xs font-black text-white">Versione {rank === 1 ? 'A' : 'B'} {recommended ? '· Consigliata' : ''}</div>
                    <div className="mt-0.5 text-[9px] text-slate-500">Rank #{rank} · WAV reale analizzato</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-white">{score ? score.toFixed(1) : '—'}<span className="text-[9px] text-slate-500">/100</span></div>
                  <div className={`mt-0.5 flex items-center justify-end gap-1 text-[9px] font-black ${passed ? 'text-emerald-400' : 'text-amber-300'}`}><ShieldCheck className="h-3 w-3" />{passed ? 'PASS' : 'CHECK'}</div>
                </div>
              </div>
              <audio controls preload="metadata" src={url} className="mt-3 w-full" />
              <div className="mt-3 flex justify-end">
                <a href={url} download className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] font-bold text-slate-200 hover:border-violet-400/30 hover:text-white"><Download className="h-3.5 w-3.5" />Scarica versione {rank === 1 ? 'A' : 'B'}</a>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-slate-500">
        <span>Target professionale: {target}/100</span>
        <span>Quality repair: {metadata.automaticQualityRepair ? 'eseguito quando necessario' : 'non necessario'}</span>
        <span>Ranking: {metadata.automaticCandidateRanking === false ? 'manuale' : 'automatico'}</span>
      </div>
    </section>,
    host
  );
}
