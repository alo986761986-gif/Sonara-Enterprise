import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, FileAudio, Loader2, Music, PackageOpen, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Store, Waves } from 'lucide-react';
import { getFirebaseIdToken } from '../../lib/firebaseClient';

type MarketplaceProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  unitAmount: number;
  currency: string;
  fulfilment: string;
  commercialUse: boolean;
};

type MarketplaceCategory = {
  id: string;
  name: string;
  liveListings: number;
};

type MarketplaceOrder = {
  id: string;
  productId: string;
  productName: string;
  amountTotal: number;
  currency: string;
  paymentStatus: string;
  serviceStatus: string;
  fulfilment: string;
  createdAt?: string | null;
};

function money(amount: number, currency = 'eur') {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
}

async function authenticatedFetch(input: string, init: RequestInit = {}) {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('Accedi con un account SONARA valido.');
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `HTTP ${response.status}`));
  return payload;
}

const CATEGORY_CARDS = [
  { id: 'music-licensing', title: 'Music Licensing', text: 'Tracks e instrumentals con licenza commerciale verificata.', icon: Music },
  { id: 'stems-samples', title: 'Stems & Samples', text: 'Stem, loop e sample reali, verificati prima della pubblicazione.', icon: Waves },
  { id: 'vocals-presets', title: 'Vocals & Presets', text: 'Vocal pack e preset professionali con file effettivamente scaricabili.', icon: FileAudio },
  { id: 'custom-services', title: 'Custom Services', text: 'Servizi SONARA acquistabili direttamente con pagamento Stripe.', icon: SlidersHorizontal }
];

export default function SonaraStore() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProduct, setBusyProduct] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const liveCountByCategory = useMemo(() => new Map(categories.map(item => [item.id, item.liveListings])), [categories]);

  const loadCatalog = async () => {
    const response = await fetch('/api/marketplace/catalog', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error?.message || `HTTP ${response.status}`));
    setProducts(Array.isArray(payload.products) ? payload.products : []);
    setCategories(Array.isArray(payload.categories) ? payload.categories : []);
  };

  const loadOrders = async () => {
    try {
      const payload = await authenticatedFetch('/api/marketplace/orders');
      setOrders(Array.isArray(payload.orders) ? payload.orders : []);
    } catch {
      setOrders([]);
    }
  };

  const verifyReturn = async () => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('marketplace');
    const sessionId = url.searchParams.get('marketplace_session_id');

    if (status === 'cancelled') {
      setNotice('Pagamento annullato. Nessun addebito è stato registrato da SONARA.');
      url.searchParams.delete('marketplace');
      history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }

    if (status !== 'success' || !sessionId) return;
    setNotice('Verifica del pagamento in corso...');
    try {
      const payload = await authenticatedFetch(`/api/marketplace/verify?session_id=${encodeURIComponent(sessionId)}`);
      if (payload.paid) {
        setNotice(`Pagamento confermato: ${payload.order?.productName || 'ordine SONARA'}. ${payload.order?.fulfilment || ''}`);
        await loadOrders();
      } else {
        setNotice(`Pagamento non ancora confermato (${payload.paymentStatus || 'pending'}).`);
      }
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : String(verifyError));
    } finally {
      url.searchParams.delete('marketplace');
      url.searchParams.delete('marketplace_session_id');
      history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await loadCatalog();
        if (!active) return;
        await verifyReturn();
        if (!active) return;
        await loadOrders();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const checkout = async (productId: string) => {
    setBusyProduct(productId);
    setError('');
    setNotice('');
    try {
      const payload = await authenticatedFetch('/api/marketplace/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId })
      });
      if (!payload.url) throw new Error('Stripe non ha restituito una pagina di pagamento.');
      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : String(checkoutError));
      setBusyProduct('');
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-950 to-cyan-950/20 p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-purple-200">
              <Store className="h-3.5 w-3.5" /> SONARA Store
            </div>
            <h2 className="mt-4 text-2xl font-black text-white sm:text-3xl">Asset verificati. Servizi reali. Pagamenti sicuri.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Nel Marketplace SONARA non pubblichiamo prodotti dimostrativi come se fossero vendibili. Gli asset digitali entrano in vendita solo dopo verifica di file, licenza e download. I servizi SONARA qui sotto sono già acquistabili con Stripe.</p>
          </div>
          <div className="grid min-w-[240px] grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><ShieldCheck className="h-5 w-5 text-emerald-300" /><div className="mt-2 text-sm font-black text-white">Verified only</div><div className="mt-1 text-[10px] text-slate-400">Nessun listing fittizio</div></div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4"><CreditCard className="h-5 w-5 text-cyan-300" /><div className="mt-2 text-sm font-black text-white">Stripe</div><div className="mt-1 text-[10px] text-slate-400">Checkout protetto</div></div>
          </div>
        </div>
      </section>

      {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs leading-5 text-rose-200">{error}</div>}

      <section>
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400"><PackageOpen className="h-4 w-4" /> Catalogo</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CATEGORY_CARDS.map(category => {
            const Icon = category.icon;
            const live = liveCountByCategory.get(category.id) || 0;
            return (
              <div key={category.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                <div className="flex items-start justify-between gap-3"><div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-2 text-purple-300"><Icon className="h-5 w-5" /></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${live > 0 ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-500'}`}>{live > 0 ? `${live} live` : 'in preparazione'}</span></div>
                <div className="mt-4 text-sm font-black text-white">{category.title}</div>
                <div className="mt-2 text-xs leading-5 text-slate-500">{category.text}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400"><Sparkles className="h-4 w-4" /> Servizi acquistabili ora</div>
        {loading ? (
          <div className="flex min-h-44 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/70 text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Caricamento SONARA Store...</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {products.map(product => (
              <article key={product.id} className="rounded-2xl border border-purple-500/20 bg-slate-950/80 p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div>
                    <div className="text-lg font-black text-white">{product.name}</div>
                    <p className="mt-2 max-w-xl text-xs leading-6 text-slate-400">{product.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300">Pagamento una tantum</span>{product.commercialUse && <span className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5 text-purple-300">Uso commerciale incluso nel servizio</span>}</div>
                    <div className="mt-3 text-[10px] leading-5 text-slate-500">{product.fulfilment}</div>
                  </div>
                  <div className="min-w-[150px] text-left sm:text-right"><div className="text-2xl font-black text-white">{money(product.unitAmount, product.currency)}</div><button type="button" onClick={() => void checkout(product.id)} disabled={Boolean(busyProduct)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50">{busyProduct === product.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}{busyProduct === product.id ? 'Apertura Stripe...' : 'Acquista'}</button></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-black text-white"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> I miei acquisti</div><div className="mt-1 text-[10px] text-slate-500">Gli ordini sono mostrati solo dopo verifica server-side del pagamento Stripe.</div></div><button type="button" onClick={() => void loadOrders()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black text-slate-300"><RefreshCw className="h-3.5 w-3.5" />Aggiorna</button></div>
        {orders.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">Nessun acquisto verificato.</div> : <div className="mt-4 divide-y divide-slate-800">{orders.map(order => <div key={order.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div><div className="text-sm font-bold text-white">{order.productName}</div><div className="mt-1 text-[10px] text-slate-500">{order.fulfilment}{order.createdAt ? ` · ${new Date(order.createdAt).toLocaleString('it-IT')}` : ''}</div></div><div className="flex items-center gap-3"><span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-300">PAGATO</span><span className="text-sm font-black text-white">{money(order.amountTotal, order.currency)}</span></div></div>)}</div>}
      </section>

      <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-[10px] leading-5 text-amber-200/80">Le categorie Music Licensing, Stems & Samples e Vocals & Presets restano visibili ma senza listing acquistabili finché non esistono file reali verificati e una licenza associata. Il marketplace creator con commissione SONARA del 15% sarà attivato solo con onboarding pagamenti/KYC adeguato.</div>
    </div>
  );
}
