const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
if (!secret) {
  console.error('Missing STRIPE_SECRET_KEY. Run this script only in a private terminal with a Stripe test or live secret key.');
  process.exit(1);
}

const catalog = [
  { plan: 'creator', name: 'SONARA Creator', monthly: 1299, yearly: 11990 },
  { plan: 'studio', name: 'SONARA Studio', monthly: 2999, yearly: 28790 }
];

async function stripe(path, { method = 'GET', form, idempotencyKey } = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(form ? { body: form.toString() } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Stripe HTTP ${response.status}`);
  return payload;
}

async function ensureProduct(entry) {
  const products = await stripe('/v1/products?active=true&limit=100');
  const existing = products.data?.find(product => product.metadata?.sonara_plan === entry.plan);
  if (existing) return existing;
  return stripe('/v1/products', {
    method: 'POST',
    idempotencyKey: `sonara-product-${entry.plan}-v1`,
    form: new URLSearchParams({
      name: entry.name,
      description: `${entry.name} recurring membership`,
      'metadata[sonara_plan]': entry.plan
    })
  });
}

async function ensurePrice(productId, plan, cadence, unitAmount) {
  const prices = await stripe(`/v1/prices?active=true&limit=100&product=${encodeURIComponent(productId)}&type=recurring`);
  const interval = cadence === 'monthly' ? 'month' : 'year';
  const existing = prices.data?.find(price =>
    price.currency === 'eur' &&
    price.unit_amount === unitAmount &&
    price.recurring?.interval === interval
  );
  if (existing) return existing;
  return stripe('/v1/prices', {
    method: 'POST',
    idempotencyKey: `sonara-price-${plan}-${cadence}-${unitAmount}-v1`,
    form: new URLSearchParams({
      product: productId,
      currency: 'eur',
      unit_amount: String(unitAmount),
      'recurring[interval]': interval,
      'metadata[sonara_plan]': plan,
      'metadata[sonara_cadence]': cadence
    })
  });
}

const output = {};
for (const entry of catalog) {
  const product = await ensureProduct(entry);
  output[`${entry.plan}_monthly`] = await ensurePrice(product.id, entry.plan, 'monthly', entry.monthly);
  output[`${entry.plan}_yearly`] = await ensurePrice(product.id, entry.plan, 'yearly', entry.yearly);
}

console.log('Stripe products and recurring prices are ready. Add these public price IDs to the deployment environment:');
console.log(`STRIPE_PRICE_CREATOR_MONTHLY=${output.creator_monthly.id}`);
console.log(`STRIPE_PRICE_CREATOR_YEARLY=${output.creator_yearly.id}`);
console.log(`STRIPE_PRICE_STUDIO_MONTHLY=${output.studio_monthly.id}`);
console.log(`STRIPE_PRICE_STUDIO_YEARLY=${output.studio_yearly.id}`);

