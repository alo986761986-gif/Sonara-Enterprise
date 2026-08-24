import type { BillingCadence, SonaraPlanId } from './plans';

type PaidPlanId = Exclude<SonaraPlanId, 'free'>;

type CatalogEntry = {
  envKey: string;
  planId: PaidPlanId;
  cadence: BillingCadence;
  amount: number;
  interval: 'month' | 'year';
};

type StripePrice = {
  id?: string;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string | null } | null;
  product?: string | { id?: string } | null;
};

const CATALOG: CatalogEntry[] = [
  {
    envKey: 'STRIPE_PRICE_CREATOR_MONTHLY',
    planId: 'creator',
    cadence: 'monthly',
    amount: 1299,
    interval: 'month'
  },
  {
    envKey: 'STRIPE_PRICE_CREATOR_YEARLY',
    planId: 'creator',
    cadence: 'yearly',
    amount: 11990,
    interval: 'year'
  },
  {
    envKey: 'STRIPE_PRICE_STUDIO_MONTHLY',
    planId: 'studio',
    cadence: 'monthly',
    amount: 2999,
    interval: 'month'
  },
  {
    envKey: 'STRIPE_PRICE_STUDIO_YEARLY',
    planId: 'studio',
    cadence: 'yearly',
    amount: 28790,
    interval: 'year'
  }
];

let normalizationPromise: Promise<void> | null = null;

function normalizePriceId(value: unknown): string {
  return String(value || '').match(/price_[A-Za-z0-9]+/)?.[0] || '';
}

function priceMatches(price: StripePrice | undefined, entry: CatalogEntry): boolean {
  return Boolean(
    price?.id &&
    price.active &&
    price.currency === 'eur' &&
    Number(price.unit_amount) === entry.amount &&
    price.recurring?.interval === entry.interval
  );
}

function productId(price: StripePrice): string {
  return typeof price.product === 'string' ? price.product : String(price.product?.id || '');
}

async function stripeGet(path: string): Promise<any> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('STRIPE_NOT_CONFIGURED');

  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `Stripe HTTP ${response.status}`));
  }
  return payload;
}

async function chooseMatchingPrice(prices: StripePrice[], entry: CatalogEntry): Promise<StripePrice> {
  const matches = prices.filter(price => priceMatches(price, entry));
  if (matches.length === 1) return matches[0];

  for (const price of matches) {
    const id = productId(price);
    if (!id) continue;
    const product = await stripeGet(`/v1/products/${encodeURIComponent(id)}`);
    const expectedName = entry.planId === 'creator' ? /sonara\s+creator/i : /sonara\s+studio/i;
    if (expectedName.test(String(product?.name || ''))) return price;
  }

  throw new Error(`STRIPE_PRICE_NOT_FOUND_${entry.planId.toUpperCase()}_${entry.cadence.toUpperCase()}`);
}

async function normalizeCatalog(): Promise<void> {
  const payload = await stripeGet('/v1/prices?active=true&type=recurring&limit=100');
  const prices = Array.isArray(payload?.data) ? payload.data as StripePrice[] : [];

  for (const entry of CATALOG) {
    const raw = String(process.env[entry.envKey] || '').trim();
    const configuredId = normalizePriceId(raw);
    const configuredPrice = prices.find(price => price.id === configuredId);
    const resolved = priceMatches(configuredPrice, entry)
      ? configuredPrice as StripePrice
      : await chooseMatchingPrice(prices, entry);

    if (!resolved.id) throw new Error(`STRIPE_PRICE_ID_MISSING_${entry.envKey}`);
    process.env[entry.envKey] = resolved.id;

    if (raw !== resolved.id) {
      console.warn(`[SONARA BILLING] Repaired ${entry.envKey} using the verified Stripe catalog.`);
    }
  }
}

export async function normalizeStripeCatalogEnvironment(): Promise<void> {
  if (!normalizationPromise) {
    normalizationPromise = normalizeCatalog().catch(error => {
      normalizationPromise = null;
      throw error;
    });
  }
  await normalizationPromise;
}
