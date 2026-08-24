import React, { useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, Crown, ExternalLink, Gauge, RefreshCw, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { getFirebaseIdToken, watchFirebaseUser } from '../../lib/firebaseClient';
import { SONARA_PLANS, type BillingCadence, type SonaraPlanId } from '../../billing/plans';

interface BillingStatus {
  planId: SonaraPlanId;
  planName: string;
  cadence: BillingCadence | null;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  usedSeconds: number;
  includedSeconds: number;
  remainingSeconds: number;
  maxTrackSeconds: number;
  commercialUse: boolean;
  periodStart: string;
  periodEnd: string;
  checkoutReady: boolean;
  billingConfigured: boolean;
  portalAvailable: boolean;
  enforcementMode: 'observe' | 'meter' | 'enforce';
  limitsEnforced: boolean;
  termsUrl: string | null;
  privacyUrl: string | null;
}

const fallbackStatus: BillingStatus = {
  planId: 'free',
  planName: 'Free',
  cadence: null,
  subscriptionStatus: 'free',
  cancelAtPeriodEnd: false,
  usedSeconds: 0,
  includedSeconds: SONARA_PLANS.free.includedSeconds,
  remainingSeconds: SONARA_PLANS.free.includedSeconds,
  maxTrackSeconds: SONARA_PLANS.free.maxTrackSeconds,
  commercialUse: false,
  periodStart: new Date().toISOString(),
  periodEnd: new Date().toISOString(),
  checkoutReady: false,
  billingConfigured: false,
  portalAvailable: false,
  enforcementMode: 'observe',
  limitsEnforced: false,
  termsUrl: null,
  privacyUrl: null
};

function euro(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}

function minutes(seconds: number): string {
  const value = Math.max(0, seconds) / 60;
  return Number.isInteger(value) ? `${value} min` : `${value.toFixed(1).replace('.', ',')} min`;
}

function friendlyStatus(value: string): string {
  const labels: Record<string, string> = {
    free: 'Attivo', active: 'Attivo', trialing: 'Periodo di prova', past_due: 'Pagamento da aggiornare',
    canceled: 'Annullato', unpaid: 'Non pagato', incomplete: 'Pagamento incompleto', paused: 'In pausa'
  };
  return labels[value] || value;
}

async function billingFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = await getFirebaseIdToken(true);
  const response = await fetch(`/api/billing/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Errore pagamenti HTTP ${response.status}`);
  return payload;
}

export default function PricingAndUsage({ compact = false }: { compact?: boolean }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<BillingStatus>(fallbackStatus);
  const [cadence, setCadence] = useState<BillingCadence>('monthly');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const usagePercent = useMemo(
    () => status.includedSeconds > 0 ? Math.min(100, status.usedSeconds / status.includedSeconds * 100) : 0,
    [status]
  );

  useEffect(() => watchFirebaseUser(current => {
    setUser(current);
    setAuthReady(true);
  }), []);

  const refresh = async () => {
    if (!user) return;
    setBusy('refresh');
    try {
      const payload = await billingFetch('status');
      const nextStatus = payload.billing || fallbackStatus;
      setStatus(nextStatus);
      window.dispatchEvent(new CustomEvent('sonara:billing-updated', { detail: nextStatus }));
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (user) void refresh();
    else if (authReady) setStatus(fallbackStatus);
  }, [user, authReady]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('billing');
    if (!result) return;
    if (result === 'success') setNotice({ type: 'success', text: 'Pagamento completato. Il piano si aggiornerà automaticamente tra pochi secondi.' });
    if (result === 'cancelled') setNotice({ type: 'info', text: 'Pagamento annullato: non è stato effettuato alcun addebito.' });
    if (result === 'portal-return') setNotice({ type: 'info', text: 'Bentornato dal portale pagamenti.' });
    const url = new URL(window.location.href);
    url.searchParams.delete('billing');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    if (user) window.setTimeout(() => void refresh(), 1800);
  }, [user]);

  const checkout = async (planId: SonaraPlanId) => {
    if (planId === 'free') return;
    if (!user) {
      setNotice({ type: 'error', text: 'Accedi o crea un account SONARA prima di scegliere un piano.' });
      return;
    }
    setBusy(`checkout-${planId}`);
    try {
      const payload = await billingFetch('checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, cadence })
      });
      if (!payload.url) throw new Error('Stripe non ha restituito la pagina di pagamento.');
      window.location.assign(payload.url);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : String(error) });
      setBusy('');
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    try {
      const payload = await billingFetch('portal', { method: 'POST' });
      if (!payload.url) throw new Error('Portale Stripe non disponibile.');
      window.location.assign(payload.url);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : String(error) });
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-purple-500/25 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,.22),transparent_42%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(2,6,23,.98))] p-5 shadow-2xl shadow-purple-950/20 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/25 bg-purple-500/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-purple-200"><Crown className="h-3.5 w-3.5" />SONARA MEMBERSHIP</div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">Crea di più. Mantieni il controllo.</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400 sm:text-sm">Minuti chiari, nessun credito incomprensibile. Ogni brano generato può essere scaricato senza acquistarlo una seconda volta.</p>
          </div>
          <div className="inline-flex self-start rounded-xl border border-slate-700 bg-slate-950/80 p-1">
            {(['monthly', 'yearly'] as const).map(value => (
              <button key={value} type="button" onClick={() => setCadence(value)} className={`rounded-lg px-4 py-2 text-xs font-black transition ${cadence === value ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                {value === 'monthly' ? 'Mensile' : 'Annuale · risparmia'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {notice && <div className={`rounded-xl border p-4 text-xs ${notice.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : notice.type === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'}`}>{notice.text}</div>}

      {user && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black uppercase tracking-wider text-slate-500">Piano attivo</span><span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">{status.planName} · {friendlyStatus(status.subscriptionStatus)}</span></div>
              <div className="mt-3 text-xl font-black text-white">{minutes(status.usedSeconds)} utilizzati su {minutes(status.includedSeconds)}</div>
              <div className="mt-1 text-[11px] text-slate-500">Rinnovo del contatore: {new Date(status.periodEnd).toLocaleDateString('it-IT')}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void refresh()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />Aggiorna</button>
              {status.portalAvailable && <button type="button" onClick={() => void openPortal()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-xs font-black text-purple-100 disabled:opacity-40"><CreditCard className="h-4 w-4" />Gestisci pagamento<ExternalLink className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 transition-all" style={{ width: `${usagePercent}%` }} /></div>
          <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-600"><span>{Math.round(usagePercent)}% utilizzato</span><span>{minutes(status.remainingSeconds)} disponibili</span></div>
          {status.cancelAtPeriodEnd && <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">Il piano resterà attivo fino al termine del periodo, poi passerà a Free.</div>}
        </section>
      )}

      <div className={`grid gap-4 ${compact ? 'xl:grid-cols-3' : 'lg:grid-cols-3'}`}>
        {(Object.values(SONARA_PLANS)).map(plan => {
          const selected = status.planId === plan.id;
          const changingPaidPlan = status.planId !== 'free' && plan.id !== 'free' && !selected;
          const highlighted = plan.id === 'creator';
          const annualEquivalent = plan.yearlyPriceEur ? plan.yearlyPriceEur / 12 : 0;
          const price = cadence === 'yearly' ? annualEquivalent : plan.monthlyPriceEur;
          const waiting = busy === `checkout-${plan.id}`;
          return (
            <section key={plan.id} className={`relative flex min-h-full flex-col overflow-hidden rounded-3xl border p-5 transition sm:p-6 ${highlighted ? 'border-purple-400/50 bg-gradient-to-b from-purple-500/15 to-slate-950 shadow-2xl shadow-purple-950/30' : 'border-slate-800 bg-slate-950/70'} ${selected ? 'ring-1 ring-emerald-400/50' : ''}`}>
              {plan.badge && <div className="absolute right-0 top-0 rounded-bl-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-3 py-2 text-[9px] font-black tracking-widest text-white">{plan.badge}</div>}
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${plan.id === 'free' ? 'bg-slate-800 text-slate-300' : plan.id === 'creator' ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/15 text-cyan-300'}`}>{plan.id === 'free' ? <Sparkles className="h-5 w-5" /> : plan.id === 'creator' ? <Zap className="h-5 w-5" /> : <Crown className="h-5 w-5" />}</div>
              <h3 className="mt-5 text-xl font-black text-white">SONARA {plan.name}</h3>
              <p className="mt-2 min-h-12 text-xs leading-5 text-slate-500">{plan.description}</p>
              <div className="mt-5 flex items-end gap-1"><span className="text-3xl font-black tracking-tight text-white">{euro(price)}</span>{plan.id !== 'free' && <span className="pb-1 text-xs text-slate-600">/mese</span>}</div>
              {cadence === 'yearly' && plan.id !== 'free' && <div className="mt-1 text-[10px] font-bold text-emerald-400">Addebito annuale di {euro(plan.yearlyPriceEur)}</div>}
              <div className="my-5 h-px bg-slate-800" />
              <div className="flex-1 space-y-3">{plan.features.map(feature => <div key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-slate-300"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><Check className="h-3 w-3" /></span>{feature}</div>)}</div>
              <button
                type="button"
                disabled={selected || plan.id === 'free' || Boolean(busy) || (changingPaidPlan ? !status.portalAvailable : !status.checkoutReady)}
                onClick={() => void (changingPaidPlan ? openPortal() : checkout(plan.id))}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${highlighted ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white' : 'border border-slate-700 bg-slate-900 text-white'}`}
              >
                {waiting ? <RefreshCw className="h-4 w-4 animate-spin" /> : selected ? <ShieldCheck className="h-4 w-4" /> : plan.id === 'free' ? <Gauge className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {selected ? 'Piano attivo' : plan.id === 'free' ? 'Incluso' : changingPaidPlan ? 'Cambia dal portale' : !status.checkoutReady ? 'Pagamenti in configurazione' : `Scegli ${plan.name}`}
              </button>
            </section>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-[11px] leading-5 text-slate-500">
        I minuti indicano la durata audio richiesta. Le generazioni non avviate per un errore tecnico non vengono conteggiate. L’uso commerciale è disponibile solo sui nuovi brani creati durante un piano idoneo e resta soggetto ai Termini SONARA. Prezzi ed eventuale IVA vengono mostrati nella pagina di pagamento.
        <span className="ml-1 inline-flex gap-2"><a className="font-bold text-purple-300 hover:text-purple-200" href={status.termsUrl || '/terms'} target="_blank" rel="noreferrer">Termini</a><a className="font-bold text-purple-300 hover:text-purple-200" href={status.privacyUrl || '/privacy'} target="_blank" rel="noreferrer">Privacy</a></span>
      </div>
    </div>
  );
}
