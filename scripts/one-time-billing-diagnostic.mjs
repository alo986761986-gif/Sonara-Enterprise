import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PREFIX = '[SONARA BILLING DIAGNOSTIC]';

function normalizePrice(value) {
  return String(value || '').match(/price_[A-Za-z0-9]+/)?.[0] || '';
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [local = '', domain = ''] = value.split('@');
  if (!domain) return value ? `${value.slice(0, 2)}***` : '';
  return `${local.slice(0, 2)}***@${domain}`;
}

function dateMillis(value) {
  const millis = Date.parse(String(value || ''));
  return Number.isFinite(millis) ? millis : 0;
}

function initializeFirebase() {
  const existing = getApps()[0];
  if (existing) return existing;

  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();

  return initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(projectId ? { projectId } : {})
  });
}

async function stripe(path, params = {}) {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('STRIPE_SECRET_KEY missing');
  const query = new URLSearchParams(params);
  const url = `https://api.stripe.com${path}${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, error: String(payload?.error?.message || `Stripe HTTP ${response.status}`) };
  }
  return { ok: true, status: response.status, payload };
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    vercelEnvironment: String(process.env.VERCEL_ENV || ''),
    stripe: {},
    firebase: {},
    firestore: {}
  };

  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  report.stripe.mode = secret.startsWith('sk_test_') ? 'test' : secret.startsWith('sk_live_') ? 'live' : 'unknown';

  const account = await stripe('/v1/account');
  report.stripe.account = account.ok
    ? { idSuffix: String(account.payload?.id || '').slice(-6), country: account.payload?.country || null }
    : { error: account.error, status: account.status };

  const configured = {
    creatorMonthly: normalizePrice(process.env.STRIPE_PRICE_CREATOR_MONTHLY),
    creatorYearly: normalizePrice(process.env.STRIPE_PRICE_CREATOR_YEARLY),
    studioMonthly: normalizePrice(process.env.STRIPE_PRICE_STUDIO_MONTHLY),
    studioYearly: normalizePrice(process.env.STRIPE_PRICE_STUDIO_YEARLY)
  };

  const configuredChecks = {};
  for (const [name, priceId] of Object.entries(configured)) {
    if (!priceId) {
      configuredChecks[name] = { configured: false, valid: false };
      continue;
    }
    const result = await stripe(`/v1/prices/${encodeURIComponent(priceId)}`);
    configuredChecks[name] = {
      configured: true,
      idSuffix: priceId.slice(-6),
      valid: result.ok,
      active: result.ok ? Boolean(result.payload?.active) : false,
      currency: result.ok ? result.payload?.currency || null : null,
      amount: result.ok ? result.payload?.unit_amount ?? null : null,
      interval: result.ok ? result.payload?.recurring?.interval || null : null,
      error: result.ok ? null : result.error
    };
  }
  report.stripe.configuredPrices = configuredChecks;

  const prices = await stripe('/v1/prices', { active: 'true', type: 'recurring', limit: '100' });
  report.stripe.recurringPriceCount = prices.ok ? Number(prices.payload?.data?.length || 0) : null;
  report.stripe.recurringPrices = prices.ok
    ? (prices.payload?.data || []).map(price => ({
        idSuffix: String(price?.id || '').slice(-6),
        productSuffix: String(price?.product || '').slice(-6),
        amount: price?.unit_amount ?? null,
        currency: price?.currency || null,
        interval: price?.recurring?.interval || null,
        plan: price?.metadata?.sonara_plan || null,
        cadence: price?.metadata?.sonara_cadence || null
      }))
    : [{ error: prices.error }];

  const events = await stripe('/v1/events', { type: 'checkout.session.completed', limit: '20' });
  report.stripe.checkoutCompletedCount = events.ok ? Number(events.payload?.data?.length || 0) : null;
  report.stripe.checkoutEvents = events.ok
    ? (events.payload?.data || []).map(event => ({
        idSuffix: String(event?.id || '').slice(-6),
        created: event?.created || null,
        livemode: Boolean(event?.livemode),
        subscriptionSuffix: String(event?.data?.object?.subscription || '').slice(-6),
        uidPrefix: String(event?.data?.object?.client_reference_id || event?.data?.object?.metadata?.firebase_uid || '').slice(0, 8),
        plan: event?.data?.object?.metadata?.sonara_plan || null,
        cadence: event?.data?.object?.metadata?.sonara_cadence || null
      }))
    : [{ error: events.error }];

  const subscriptions = await stripe('/v1/subscriptions', { status: 'all', limit: '20' });
  report.stripe.subscriptionCount = subscriptions.ok ? Number(subscriptions.payload?.data?.length || 0) : null;
  report.stripe.subscriptions = subscriptions.ok
    ? (subscriptions.payload?.data || []).map(subscription => ({
        idSuffix: String(subscription?.id || '').slice(-6),
        status: subscription?.status || null,
        customerSuffix: String(subscription?.customer || '').slice(-6),
        uidPrefix: String(subscription?.metadata?.firebase_uid || '').slice(0, 8),
        plan: subscription?.metadata?.sonara_plan || null,
        cadence: subscription?.metadata?.sonara_cadence || null
      }))
    : [{ error: subscriptions.error }];

  const app = initializeFirebase();
  const auth = getAuth(app);
  const usersResult = await auth.listUsers(1000);
  const users = usersResult.users
    .map(user => ({
      uidPrefix: user.uid.slice(0, 8),
      email: maskEmail(user.email),
      emailVerified: Boolean(user.emailVerified),
      disabled: Boolean(user.disabled),
      createdAt: user.metadata.creationTime || null,
      lastSignInAt: user.metadata.lastSignInTime || null,
      lastSignInMillis: dateMillis(user.metadata.lastSignInTime)
    }))
    .sort((a, b) => b.lastSignInMillis - a.lastSignInMillis);

  const recentThreshold = Date.now() - 48 * 60 * 60 * 1000;
  report.firebase.userCount = users.length;
  report.firebase.recentUsers = users
    .filter(user => user.lastSignInMillis >= recentThreshold)
    .slice(0, 10)
    .map(({ lastSignInMillis, ...user }) => user);
  report.firebase.latestUsers = users.slice(0, 10).map(({ lastSignInMillis, ...user }) => user);

  const firestore = getFirestore(app);
  const billingSnapshot = await firestore.collection('sonaraBilling').limit(100).get();
  report.firestore.billingRecordCount = billingSnapshot.size;
  report.firestore.billingRecords = billingSnapshot.docs.map(doc => {
    const data = doc.data() || {};
    return {
      uidPrefix: doc.id.slice(0, 8),
      planId: data.planId || null,
      cadence: data.cadence || null,
      subscriptionStatus: data.subscriptionStatus || null,
      stripeCustomerSuffix: String(data.stripeCustomerId || '').slice(-6),
      stripeSubscriptionSuffix: String(data.stripeSubscriptionId || '').slice(-6)
    };
  });

  console.log(`${PREFIX} ${JSON.stringify(report)}`);
}

main().catch(error => {
  console.error(`${PREFIX} FAILED ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 0;
});
