import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: false } };

const ONE_TIME_TOKEN = '50354dc8c8f9dc3c3dd35e843562987f90b31234db350fde35ab235793986161';
const LOOKBACK_SECONDS = 14 * 24 * 60 * 60;

const DEFAULT_PRICE_IDS = {
  creator: {
    monthly: 'price_1U7wA6QuVwbxH46Dr5OOr9ns',
    yearly: 'price_1U7wA5QuVwbxH46DnS3TSczf'
  },
  studio: {
    monthly: 'price_1U7wA6QuVwbxH46DwU34T5xL',
    yearly: 'price_1U7wA5QuVwbxH46DYVWIPu5Q'
  }
} as const;

type PlanId = 'creator' | 'studio';
type Cadence = 'monthly' | 'yearly';

type FallbackMetadata = {
  uid?: string;
  planId?: string;
  cadence?: string;
};

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function stripeId(value: any): string {
  return typeof value === 'string' ? value : String(value?.id || '');
}

function normalizePrice(value: unknown): string {
  return String(value || '').match(/price_[A-Za-z0-9]+/)?.[0] || '';
}

function configuredPrice(planId: PlanId, cadence: Cadence): string {
  const key = `STRIPE_PRICE_${planId.toUpperCase()}_${cadence.toUpperCase()}`;
  return normalizePrice(process.env[key]) || DEFAULT_PRICE_IDS[planId][cadence];
}

function pricePlan(priceId: string): { planId: PlanId; cadence: Cadence } | null {
  for (const planId of ['creator', 'studio'] as const) {
    for (const cadence of ['monthly', 'yearly'] as const) {
      if (configuredPrice(planId, cadence) === priceId) return { planId, cadence };
    }
  }
  return null;
}

function validPlan(value: unknown): value is PlanId {
  return value === 'creator' || value === 'studio';
}

function validCadence(value: unknown): value is Cadence {
  return value === 'monthly' || value === 'yearly';
}

function getAdminApp() {
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

async function stripeGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const query = new URLSearchParams(params);
  const response = await fetch(`https://api.stripe.com${path}${query.size ? `?${query.toString()}` : ''}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `Stripe HTTP ${response.status}`));
  return payload;
}

function timestampMillis(value: any): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value.toMillis === 'function') return Number(value.toMillis());
  if (value && typeof value._seconds === 'number') return Number(value._seconds) * 1000;
  return 0;
}

async function syncSubscription(subscription: any, fallback: FallbackMetadata) {
  const subscriptionId = stripeId(subscription);
  const uid = String(subscription?.metadata?.firebase_uid || fallback.uid || '').trim();
  if (!subscriptionId || !uid) return null;

  const item = subscription?.items?.data?.[0];
  const priceId = stripeId(item?.price);
  const mapped = pricePlan(priceId);
  const planCandidate = subscription?.metadata?.sonara_plan || fallback.planId || mapped?.planId;
  const cadenceCandidate = subscription?.metadata?.sonara_cadence || fallback.cadence || mapped?.cadence;
  if (!validPlan(planCandidate) || !validCadence(cadenceCandidate)) return null;

  const customerId = stripeId(subscription?.customer);
  const periodStartSeconds = Number(subscription?.current_period_start || item?.current_period_start || 0);
  const periodEndSeconds = Number(subscription?.current_period_end || item?.current_period_end || 0);
  const firestore = getFirestore(getAdminApp());
  const reference = firestore.collection('sonaraBilling').doc(uid);

  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists ? snapshot.data() || {} : {};
    const previousPeriodStart = timestampMillis(previous.usagePeriodStart);
    const incomingPeriodStart = periodStartSeconds > 0 ? periodStartSeconds * 1000 : 0;
    const periodChanged = incomingPeriodStart > 0 && incomingPeriodStart > previousPeriodStart;

    transaction.set(reference, {
      planId: planCandidate,
      cadence: cadenceCandidate,
      subscriptionStatus: String(subscription?.status || 'inactive'),
      stripeCustomerId: customerId || previous.stripeCustomerId || null,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId || previous.stripePriceId || null,
      usageSeconds: periodChanged ? 0 : Math.max(0, Number(previous.usageSeconds || 0)),
      usagePeriodStart: periodStartSeconds > 0
        ? Timestamp.fromMillis(periodStartSeconds * 1000)
        : previous.usagePeriodStart || FieldValue.serverTimestamp(),
      usagePeriodEnd: periodEndSeconds > 0
        ? Timestamp.fromMillis(periodEndSeconds * 1000)
        : previous.usagePeriodEnd || null,
      cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      updatedAt: FieldValue.serverTimestamp(),
      reconciledFromStripeSandboxAt: FieldValue.serverTimestamp()
    }, { merge: true });

    if (customerId) {
      transaction.set(firestore.collection('sonaraBillingCustomers').doc(customerId), {
        uid,
        subscriptionId,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  });

  return {
    uid,
    subscriptionId,
    customerId,
    planId: planCandidate,
    cadence: cadenceCandidate,
    status: String(subscription?.status || 'inactive'),
    priceId
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (queryValue(req.query?.token) !== ONE_TIME_TOKEN) return res.status(403).json({ error: 'FORBIDDEN' });

  const stripeSecret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!stripeSecret.startsWith('sk_test_')) {
    return res.status(409).json({ error: 'TEST_MODE_REQUIRED' });
  }

  try {
    const createdGte = String(Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS);
    const queue = new Map<string, FallbackMetadata>();

    const events = await stripeGet('/v1/events', {
      type: 'checkout.session.completed',
      limit: '100',
      'created[gte]': createdGte
    });

    for (const event of events?.data || []) {
      const session = event?.data?.object || {};
      const subscriptionId = stripeId(session?.subscription);
      if (!subscriptionId) continue;
      queue.set(subscriptionId, {
        uid: String(session?.client_reference_id || session?.metadata?.firebase_uid || ''),
        planId: String(session?.metadata?.sonara_plan || ''),
        cadence: String(session?.metadata?.sonara_cadence || '')
      });
    }

    const subscriptions = await stripeGet('/v1/subscriptions', {
      status: 'all',
      limit: '100',
      'created[gte]': createdGte
    });

    const subscriptionObjects = new Map<string, any>();
    for (const subscription of subscriptions?.data || []) {
      const subscriptionId = stripeId(subscription);
      if (!subscriptionId) continue;
      subscriptionObjects.set(subscriptionId, subscription);
      if (subscription?.metadata?.firebase_uid && !queue.has(subscriptionId)) {
        queue.set(subscriptionId, {
          uid: String(subscription.metadata.firebase_uid || ''),
          planId: String(subscription.metadata.sonara_plan || ''),
          cadence: String(subscription.metadata.sonara_cadence || '')
        });
      }
    }

    const synced: any[] = [];
    const skipped: string[] = [];
    for (const [subscriptionId, fallback] of queue.entries()) {
      const subscription = subscriptionObjects.get(subscriptionId) ||
        await stripeGet(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
      const result = await syncSubscription(subscription, fallback);
      if (result) synced.push(result);
      else skipped.push(subscriptionId);
    }

    await getFirestore(getAdminApp()).collection('sonaraMaintenance').doc('stripeSandboxReconcile20260824').set({
      executedAt: FieldValue.serverTimestamp(),
      checkoutEventsFound: Number(events?.data?.length || 0),
      subscriptionsFound: Number(subscriptions?.data?.length || 0),
      syncedCount: synced.length,
      skippedCount: skipped.length,
      syncedSubscriptionIds: synced.map(item => item.subscriptionId),
      skippedSubscriptionIds: skipped
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      mode: 'test',
      checkoutEventsFound: Number(events?.data?.length || 0),
      subscriptionsFound: Number(subscriptions?.data?.length || 0),
      synced,
      skipped
    });
  } catch (error) {
    console.error('[SONARA SANDBOX RECONCILE]', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
