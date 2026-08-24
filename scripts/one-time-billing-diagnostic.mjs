import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const PREFIX = '[SONARA BILLING REPAIR]';
const PLAN_ID = 'studio';
const CADENCE = 'monthly';
const EXPECTED_AMOUNT = 2999;
const EXPECTED_CURRENCY = 'eur';
const EXPECTED_INTERVAL = 'month';
const LEGAL_VERSION = String(process.env.SONARA_LEGAL_VERSION || '2026-08-24-v1').trim();

function normalizePrice(value) {
  return String(value || '').match(/price_[A-Za-z0-9]+/)?.[0] || '';
}

function stripeId(value) {
  return typeof value === 'string' ? value : String(value?.id || '');
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [local = '', domain = ''] = value.split('@');
  if (!domain) return value ? `${value.slice(0, 2)}***` : '';
  return `${local.slice(0, 2)}***@${domain}`;
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

async function stripe(path, { method = 'GET', params, form, idempotencyKey } = {}) {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret.startsWith('sk_test_')) throw new Error('TEST_MODE_REQUIRED');

  const query = new URLSearchParams(params || {});
  const url = `https://api.stripe.com${path}${query.size ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(form ? { body: form.toString() } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `Stripe HTTP ${response.status}`));
  return payload;
}

async function resolveStudioMonthlyPrice() {
  const configuredPriceId = normalizePrice(process.env.STRIPE_PRICE_STUDIO_MONTHLY);
  if (configuredPriceId) {
    try {
      const price = await stripe(`/v1/prices/${encodeURIComponent(configuredPriceId)}`);
      if (
        price?.active &&
        price?.currency === EXPECTED_CURRENCY &&
        Number(price?.unit_amount) === EXPECTED_AMOUNT &&
        price?.recurring?.interval === EXPECTED_INTERVAL
      ) {
        return price;
      }
    } catch {
      // Fall through to catalog discovery.
    }
  }

  const prices = await stripe('/v1/prices', {
    params: { active: 'true', type: 'recurring', limit: '100' }
  });
  const matching = (prices?.data || []).filter(price =>
    price?.active &&
    price?.currency === EXPECTED_CURRENCY &&
    Number(price?.unit_amount) === EXPECTED_AMOUNT &&
    price?.recurring?.interval === EXPECTED_INTERVAL
  );
  if (matching.length === 1) return matching[0];

  for (const price of matching) {
    const productId = stripeId(price?.product);
    if (!productId) continue;
    const product = await stripe(`/v1/products/${encodeURIComponent(productId)}`);
    if (/sonara\s+studio/i.test(String(product?.name || ''))) return price;
  }

  throw new Error('STUDIO_MONTHLY_PRICE_NOT_FOUND');
}

async function resolveCustomer(user) {
  const customers = await stripe('/v1/customers', {
    params: { email: String(user.email || ''), limit: '100' }
  });
  const candidates = customers?.data || [];
  let customer = candidates.find(item => item?.metadata?.firebase_uid === user.uid) || candidates[0];

  if (!customer) {
    customer = await stripe('/v1/customers', {
      method: 'POST',
      idempotencyKey: `sonara-sandbox-customer-${user.uid}`,
      form: new URLSearchParams({
        email: String(user.email || ''),
        ...(user.displayName ? { name: user.displayName } : {}),
        'metadata[firebase_uid]': user.uid,
        'metadata[sonara_environment]': 'sandbox'
      })
    });
  } else if (customer?.metadata?.firebase_uid !== user.uid) {
    customer = await stripe(`/v1/customers/${encodeURIComponent(customer.id)}`, {
      method: 'POST',
      form: new URLSearchParams({
        'metadata[firebase_uid]': user.uid,
        'metadata[sonara_environment]': 'sandbox'
      })
    });
  }

  return customer;
}

async function resolvePaymentMethod(customerId) {
  const methods = await stripe('/v1/payment_methods', {
    params: { customer: customerId, type: 'card', limit: '10' }
  });
  const existing = methods?.data?.[0];
  if (existing?.id) return existing;

  return stripe('/v1/payment_methods/pm_card_visa/attach', {
    method: 'POST',
    form: new URLSearchParams({ customer: customerId })
  });
}

async function ensureCustomerDefaultPaymentMethod(customerId, paymentMethodId) {
  return stripe(`/v1/customers/${encodeURIComponent(customerId)}`, {
    method: 'POST',
    form: new URLSearchParams({
      'invoice_settings[default_payment_method]': paymentMethodId
    })
  });
}

async function resolveSubscription(customerId, user, priceId, paymentMethodId) {
  const subscriptions = await stripe('/v1/subscriptions', {
    params: { customer: customerId, status: 'all', limit: '100' }
  });

  const existing = (subscriptions?.data || []).find(subscription => {
    const itemPriceId = stripeId(subscription?.items?.data?.[0]?.price);
    return (
      subscription?.metadata?.firebase_uid === user.uid &&
      itemPriceId === priceId &&
      !['canceled', 'incomplete_expired'].includes(String(subscription?.status || ''))
    );
  });
  if (existing) return existing;

  return stripe('/v1/subscriptions', {
    method: 'POST',
    idempotencyKey: `sonara-sandbox-${PLAN_ID}-${CADENCE}-${user.uid}`,
    form: new URLSearchParams({
      customer: customerId,
      'items[0][price]': priceId,
      default_payment_method: paymentMethodId,
      payment_behavior: 'error_if_incomplete',
      'payment_settings[payment_method_types][0]': 'card',
      'metadata[firebase_uid]': user.uid,
      'metadata[sonara_plan]': PLAN_ID,
      'metadata[sonara_cadence]': CADENCE,
      'metadata[sonara_legal_version]': LEGAL_VERSION
    })
  });
}

async function writeBillingRecord(app, user, customer, subscription, price) {
  const firestore = getFirestore(app);
  const item = subscription?.items?.data?.[0];
  const periodStartSeconds = Number(subscription?.current_period_start || item?.current_period_start || 0);
  const periodEndSeconds = Number(subscription?.current_period_end || item?.current_period_end || 0);
  const now = new Date();
  const fallbackEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));

  const billingReference = firestore.collection('sonaraBilling').doc(user.uid);
  const customerReference = firestore.collection('sonaraBillingCustomers').doc(customer.id);
  const maintenanceReference = firestore.collection('sonaraMaintenance').doc('authorizedSandboxStudioSubscription20260824');

  await firestore.runTransaction(async transaction => {
    transaction.set(billingReference, {
      planId: PLAN_ID,
      cadence: CADENCE,
      subscriptionStatus: String(subscription?.status || 'active'),
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,
      usageSeconds: 0,
      usagePeriodStart: periodStartSeconds > 0 ? Timestamp.fromMillis(periodStartSeconds * 1000) : Timestamp.fromDate(now),
      usagePeriodEnd: periodEndSeconds > 0 ? Timestamp.fromMillis(periodEndSeconds * 1000) : Timestamp.fromDate(fallbackEnd),
      cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      testMode: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    transaction.set(customerReference, {
      uid: user.uid,
      subscriptionId: subscription.id,
      testMode: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    transaction.set(maintenanceReference, {
      executedAt: FieldValue.serverTimestamp(),
      uidPrefix: user.uid.slice(0, 8),
      planId: PLAN_ID,
      cadence: CADENCE,
      subscriptionStatus: String(subscription?.status || ''),
      stripeAccountMode: 'test',
      completed: true
    }, { merge: true });
  });
}

async function main() {
  const app = initializeFirebase();
  const usersResult = await getAuth(app).listUsers(1000);
  const enabledUsers = usersResult.users.filter(user => !user.disabled);
  if (enabledUsers.length !== 1) {
    throw new Error(`EXPECTED_ONE_ENABLED_FIREBASE_USER_FOUND_${enabledUsers.length}`);
  }

  const user = enabledUsers[0];
  if (!user.email) throw new Error('FIREBASE_USER_EMAIL_MISSING');

  const price = await resolveStudioMonthlyPrice();
  const customer = await resolveCustomer(user);
  const paymentMethod = await resolvePaymentMethod(customer.id);
  await ensureCustomerDefaultPaymentMethod(customer.id, paymentMethod.id);
  const subscription = await resolveSubscription(customer.id, user, price.id, paymentMethod.id);

  if (!['active', 'trialing'].includes(String(subscription?.status || ''))) {
    throw new Error(`SUBSCRIPTION_NOT_ACTIVE_${String(subscription?.status || 'unknown')}`);
  }

  await writeBillingRecord(app, user, customer, subscription, price);

  console.log(`${PREFIX} SUCCESS ${JSON.stringify({
    mode: 'test',
    user: maskEmail(user.email),
    uidPrefix: user.uid.slice(0, 8),
    planId: PLAN_ID,
    cadence: CADENCE,
    priceAmount: price.unit_amount,
    currency: price.currency,
    customerSuffix: customer.id.slice(-6),
    subscriptionSuffix: subscription.id.slice(-6),
    subscriptionStatus: subscription.status
  })}`);
}

main().catch(error => {
  console.error(`${PREFIX} FAILED ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 0;
});
