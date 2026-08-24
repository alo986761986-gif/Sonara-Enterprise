import billingHandler from './[...path]';

export const config = { api: { bodyParser: false } };

const STRIPE_PRICE_ENV_KEYS = [
  'STRIPE_PRICE_CREATOR_MONTHLY',
  'STRIPE_PRICE_CREATOR_YEARLY',
  'STRIPE_PRICE_STUDIO_MONTHLY',
  'STRIPE_PRICE_STUDIO_YEARLY'
] as const;

function normalizeStripePriceEnvironment(): void {
  for (const key of STRIPE_PRICE_ENV_KEYS) {
    const raw = String(process.env[key] || '').trim();
    if (!raw) continue;

    const priceId = raw.match(/price_[A-Za-z0-9]+/)?.[0];
    if (priceId && priceId !== raw) {
      process.env[key] = priceId;
      console.warn(`[SONARA BILLING] Normalized malformed ${key} configuration.`);
    }
  }
}

export default async function handler(req: any, res: any) {
  normalizeStripePriceEnvironment();
  return billingHandler(req, res);
}
