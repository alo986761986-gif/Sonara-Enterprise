import { createHmac, timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  SONARA_PLANS,
  isBillingCadence,
  isSonaraPlanId,
  type BillingCadence,
  type SonaraPlanId
} from '../../src/billing/plans';

export const config = { api: { bodyParser: false } };

const DEFAULT_APP_URL = 'https://sonaraenterprise.com';
const DEFAULT_ENGINE_URL = 'https://api.sonaraenterprise.com';
const DEFAULT_LEGAL_VERSION = '2026-08-24-v1';
const DEFAULT_TERMS_URL = `${DEFAULT_APP_URL}/terms`;
const DEFAULT_PRIVACY_URL = `${DEFAULT_APP_URL}/privacy`;
const WEBHOOK_TOLERANCE_SECONDS = 300;

const DEFAULT_STRIPE_PRICE_IDS: Record<Exclude<SonaraPlanId, 'free'>, Record<BillingCadence, string>> = {
  creator: {
    monthly: 'price_1U7wA6QuVwbxH46Dr5OOr9ns',
    yearly: 'price_1U7wA5QuVwbxH46DnS3TSczf'
  },
  studio: {
    monthly: 'price_1U7wA6QuVwbxH46DwU34T5xL',
    yearly: 'price_1U7wA5QuVwbxH46DYVWIPu5Q'
  }
};

interface AuthenticatedUser {
  uid: string;
  email?: string;
}

interface BillingRecord {
  planId?: SonaraPlanId;
  cadence?: BillingCadence;
  subscriptionStatus?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  usageSeconds?: number;
  usagePeriodStart?: Timestamp;
  usagePeriodEnd?: Timestamp;
  cancelAtPeriodEnd?: boolean;
}

let adminApp: App | null = null;

function serviceAccountConfigured(): boolean {
  return Boolean(
    String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim() ||
    String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
  );
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return existing;
  }

  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();
  adminApp = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(projectId ? { projectId } : {})
  });
  return adminApp;
}

function billingStoreReady(): boolean {
  return serviceAccountConfigured();
}

function stripePriceId(planId: SonaraPlanId, cadence: BillingCadence): string {
  if (planId === 'creator' && cadence === 'monthly') return String(process.env.STRIPE_PRICE_CREATOR_MONTHLY || DEFAULT_STRIPE_PRICE_IDS.creator.monthly).trim();
  if (planId === 'creator' && cadence === 'yearly') return String(process.env.STRIPE_PRICE_CREATOR_YEARLY || DEFAULT_STRIPE_PRICE_IDS.creator.yearly).trim();
  if (planId === 'studio' && cadence === 'monthly') return String(process.env.STRIPE_PRICE_STUDIO_MONTHLY || DEFAULT_STRIPE_PRICE_IDS.studio.monthly).trim();
  if (planId === 'studio' && cadence === 'yearly') return String(process.env.STRIPE_PRICE_STUDIO_YEARLY || DEFAULT_STRIPE_PRICE_IDS.studio.yearly).trim();
  return '';
}

function legalPublicationReady(): boolean {
  const configured = String(process.env.SONARA_LEGAL_PUBLISH_READY || '').trim().toLowerCase();
  return configured ? configured === 'true' : true;
}

function legalVersion(): string {
  return String(process.env.SONARA_LEGAL_VERSION || DEFAULT_LEGAL_VERSION).trim();
}

function termsUrl(): string {
  return String(process.env.SONARA_TERMS_URL || DEFAULT_TERMS_URL).trim();
}

function privacyUrl(): string {
  return String(process.env.SONARA_PRIVACY_URL || DEFAULT_PRIVACY_URL).trim();
}

function configuredPriceIds(): string[] {
  return [
    stripePriceId('creator', 'monthly'),
    stripePriceId('creator', 'yearly'),
    stripePriceId('studio', 'monthly'),
    stripePriceId('studio', 'yearly')
  ].filter(Boolean);
}

function checkoutSessionReady(): boolean {
  return Boolean(
    billingStoreReady() &&
    String(process.env.STRIPE_SECRET_KEY || '').trim() &&
    legalPublicationReady() &&
    legalVersion() &&
    termsUrl() &&
    privacyUrl() &&
    configuredPriceIds().length === 4
  );
}

function webhookReady(): boolean {
  return Boolean(checkoutSessionReady() && String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
}

function portalSessionReady(): boolean {
  return Boolean(billingStoreReady() && String(process.env.STRIPE_SECRET_KEY || '').trim());
}

function enforcementMode(): 'observe' | 'meter' | 'enforce' {
  const value = String(process.env.BILLING_ENFORCEMENT_MODE || 'observe').toLowerCase();
  return value === 'enforce' ? 'enforce' : value === 'meter' ? 'meter' : 'observe';
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function errorResponse(res: any, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json(res, status, { error: { code, message }, ...extra });
}

async function readRawBody(req: any, maxBytes = 1024 * 1024): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: any): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function bearerToken(req: any): string {
  return String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function authenticateWithFirebaseRest(token: string): Promise<AuthenticatedUser | null> {
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const payload = await response.json() as { users?: Array<{ localId?: string; email?: string }> };
  const user = payload.users?.[0];
  return user?.localId ? { uid: user.localId, email: user.email } : null;
}

async function authenticatedUser(req: any): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    return await authenticateWithFirebaseRest(token);
  } catch {
    return null;
  }
}

function actionFromRequest(req: any): string {
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (queryPath) return queryPath.replace(/^\/+|\/+$/g, '').toLowerCase();
  const pathname = String(req.url || req.originalUrl || '').split(/[?#]/, 1)[0];
  const match = pathname.match(/\/api\/billing(?:\/(.*))?\/?$/i);
  return String(match?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function monthPeriod(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  };
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as any).toMillis === 'function') return Number((value as any).toMillis());
  if (value && typeof (value as any)._seconds === 'number') return Number((value as any)._seconds) * 1000;
  return 0;
}

function hasPaidAccess(record: BillingRecord, now = Date.now()): boolean {
  if (record.planId !== 'creator' && record.planId !== 'studio') return false;
  if (record.subscriptionStatus === 'active' || record.subscriptionStatus === 'trialing') return true;
  if (record.subscriptionStatus === 'past_due') return timestampToMillis(record.usagePeriodEnd) > now;
  return false;
}

function effectivePlan(record: BillingRecord | undefined): SonaraPlanId {
  return record && hasPaidAccess(record) ? record.planId as SonaraPlanId : 'free';
}

function publicBillingStatus(record: BillingRecord | undefined) {
  const planId = effectivePlan(record);
  const plan = SONARA_PLANS[planId];
  const period = monthPeriod();
  const storedPeriodEnd = timestampToMillis(record?.usagePeriodEnd);
  const periodExpired = storedPeriodEnd > 0 && Date.now() >= storedPeriodEnd;
  const periodStart = periodExpired ? period.start.getTime() : timestampToMillis(record?.usagePeriodStart) || period.start.getTime();
  const periodEnd = periodExpired ? period.end.getTime() : storedPeriodEnd || period.end.getTime();
  const usedSeconds = periodExpired ? 0 : Math.max(0, Number(record?.usageSeconds || 0));
  return {
    planId,
    planName: plan.name,
    cadence: record?.cadence || null,
    subscriptionStatus: record?.subscriptionStatus || 'free',
    cancelAtPeriodEnd: Boolean(record?.cancelAtPeriodEnd),
    usedSeconds,
    includedSeconds: plan.includedSeconds,
    remainingSeconds: Math.max(0, plan.includedSeconds - usedSeconds),
    maxTrackSeconds: plan.maxTrackSeconds,
    commercialUse: plan.commercialUse,
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
    checkoutReady: webhookReady(),
    billingConfigured: webhookReady(),
    portalAvailable: Boolean(record?.stripeCustomerId && portalSessionReady()),
    enforcementMode: enforcementMode(),
    limitsEnforced: billingStoreReady() && enforcementMode() !== 'observe',
    termsUrl: termsUrl(),
    privacyUrl: privacyUrl()
  };
}

async function getBillingRecord(uid: string): Promise<BillingRecord | undefined> {
  if (!billingStoreReady()) return undefined;
  const snapshot = await getFirestore(getAdminApp()).collection('sonaraBilling').doc(uid).get();
  return snapshot.exists ? snapshot.data() as BillingRecord : undefined;
}

function planFromPrice(priceId: string): { planId: SonaraPlanId; cadence: BillingCadence } | null {
  for (const planId of ['creator', 'studio'] as const) {
    for (const cadence of ['monthly', 'yearly'] as const) {
      if (priceId && stripePriceId(planId, cadence) === priceId) return { planId, cadence };
    }
  }
  return null;
}

async function stripeRequest(path: string, init: { method?: string; form?: URLSearchParams } = {}): Promise<any> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('STRIPE_NOT_CONFIGURED');
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    ...(init.form ? { body: init.form.toString() } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `Stripe HTTP ${response.status}`));
  return payload;
}

async function createCheckout(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const planId = body.planId;
  const cadence = body.cadence;
  if (!isSonaraPlanId(planId) || planId === 'free' || !isBillingCadence(cadence)) {
    return errorResponse(res, 400, 'INVALID_PLAN', 'Seleziona un piano SONARA a pagamento valido.');
  }
  if (!webhookReady()) {
    return errorResponse(res, 503, 'BILLING_NOT_CONFIGURED', 'I pagamenti SONARA non sono ancora configurati in produzione.');
  }

  const record = await getBillingRecord(user.uid);
  if (record?.stripeSubscriptionId && hasPaidAccess(record)) {
    return errorResponse(res, 409, 'SUBSCRIPTION_ALREADY_ACTIVE', 'Hai già un abbonamento attivo. Usa il portale per cambiare piano.', {
      portalAvailable: Boolean(record.stripeCustomerId)
    });
  }
  const appUrl = String(process.env.SONARA_APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  const priceId = stripePriceId(planId, cadence);
  const publishedLegalVersion = legalVersion();
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    client_reference_id: user.uid,
    success_url: `${appUrl}/?billing=success`,
    cancel_url: `${appUrl}/?billing=cancelled`,
    allow_promotion_codes: 'true',
    'consent_collection[terms_of_service]': 'required',
    'metadata[firebase_uid]': user.uid,
    'metadata[sonara_plan]': planId,
    'metadata[sonara_cadence]': cadence,
    'metadata[sonara_legal_version]': publishedLegalVersion,
    'subscription_data[metadata][firebase_uid]': user.uid,
    'subscription_data[metadata][sonara_plan]': planId,
    'subscription_data[metadata][sonara_cadence]': cadence,
    'subscription_data[metadata][sonara_legal_version]': publishedLegalVersion
  });
  if (record?.stripeCustomerId) form.set('customer', record.stripeCustomerId);
  else if (user.email) form.set('customer_email', user.email);
  if (String(process.env.STRIPE_AUTOMATIC_TAX || '').toLowerCase() === 'true') {
    form.set('automatic_tax[enabled]', 'true');
  }

  const session = await stripeRequest('/v1/checkout/sessions', { method: 'POST', form });
  return json(res, 200, { url: session.url });
}

async function createPortal(user: AuthenticatedUser, res: any) {
  if (!portalSessionReady()) {
    return errorResponse(res, 503, 'BILLING_NOT_CONFIGURED', 'Il portale pagamenti non è ancora configurato.');
  }
  const record = await getBillingRecord(user.uid);
  if (!record?.stripeCustomerId) {
    return errorResponse(res, 404, 'STRIPE_CUSTOMER_NOT_FOUND', 'Non esiste ancora un abbonamento da gestire.');
  }
  const appUrl = String(process.env.SONARA_APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  const form = new URLSearchParams({ customer: record.stripeCustomerId, return_url: `${appUrl}/?billing=portal-return` });
  const session = await stripeRequest('/v1/billing_portal/sessions', { method: 'POST', form });
  return json(res, 200, { url: session.url });
}

function verifyStripeSignature(raw: Buffer, signatureHeader: string): boolean {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const parts = signatureHeader.split(',').map(part => part.trim());
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2) || '';
  const signatures = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3));
  if (!secret || !timestamp || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return signatures.some(signature => {
    try {
      const candidate = Buffer.from(signature, 'hex');
      return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
    } catch {
      return false;
    }
  });
}

function stripeId(value: any): string {
  return typeof value === 'string' ? value : String(value?.id || '');
}

async function syncSubscription(subscription: any, fallbackUid = ''): Promise<void> {
  const uid = String(subscription?.metadata?.firebase_uid || fallbackUid || '').trim();
  if (!uid) throw new Error('FIREBASE_UID_MISSING');
  const item = subscription?.items?.data?.[0];
  const priceId = stripeId(item?.price);
  const mapped = planFromPrice(priceId);
  const customerId = stripeId(subscription?.customer);
  const subscriptionId = stripeId(subscription);
  const periodStartSeconds = Number(subscription?.current_period_start || item?.current_period_start || 0);
  const periodEndSeconds = Number(subscription?.current_period_end || item?.current_period_end || 0);
  const reference = getFirestore(getAdminApp()).collection('sonaraBilling').doc(uid);

  await getFirestore(getAdminApp()).runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists ? snapshot.data() as BillingRecord : {};
    const nextPeriodStart = periodStartSeconds ? Timestamp.fromMillis(periodStartSeconds * 1000) : previous.usagePeriodStart;
    const nextPeriodEnd = periodEndSeconds ? Timestamp.fromMillis(periodEndSeconds * 1000) : previous.usagePeriodEnd;
    const periodChanged = periodStartSeconds > 0 && periodStartSeconds * 1000 > timestampToMillis(previous.usagePeriodStart);
    transaction.set(reference, {
      planId: mapped?.planId || 'free',
      cadence: mapped?.cadence || null,
      subscriptionStatus: String(subscription?.status || 'inactive'),
      stripeCustomerId: customerId || previous.stripeCustomerId || null,
      stripeSubscriptionId: subscriptionId || previous.stripeSubscriptionId || null,
      stripePriceId: priceId || previous.stripePriceId || null,
      usageSeconds: periodChanged ? 0 : Math.max(0, Number(previous.usageSeconds || 0)),
      usagePeriodStart: nextPeriodStart || Timestamp.fromDate(monthPeriod().start),
      usagePeriodEnd: nextPeriodEnd || Timestamp.fromDate(monthPeriod().end),
      cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (customerId) {
      transaction.set(getFirestore(getAdminApp()).collection('sonaraBillingCustomers').doc(customerId), {
        uid,
        subscriptionId,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  });
}

async function subscriptionForEvent(object: any): Promise<any | null> {
  const directId = stripeId(object?.subscription);
  const parentId = stripeId(object?.parent?.subscription_details?.subscription);
  const subscriptionId = directId || parentId;
  if (!subscriptionId) return null;
  return stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

async function handleWebhook(req: any, res: any) {
  if (!webhookReady()) {
    return errorResponse(res, 503, 'WEBHOOK_NOT_CONFIGURED', 'Stripe webhook non configurato.');
  }
  const raw = await readRawBody(req, 2 * 1024 * 1024);
  const signature = String(req.headers?.['stripe-signature'] || '');
  if (!verifyStripeSignature(raw, signature)) {
    return errorResponse(res, 400, 'INVALID_STRIPE_SIGNATURE', 'Firma Stripe non valida.');
  }
  const event = JSON.parse(raw.toString('utf8'));
  const eventId = String(event?.id || '');
  if (!eventId) return errorResponse(res, 400, 'INVALID_STRIPE_EVENT', 'Evento Stripe senza identificativo.');
  const eventReference = getFirestore(getAdminApp()).collection('sonaraBillingEvents').doc(eventId);
  if (eventId && (await eventReference.get()).exists) return json(res, 200, { received: true, duplicate: true });

  const object = event?.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    const subscriptionId = stripeId(object.subscription);
    if (subscriptionId) {
      const subscription = await stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
      await syncSubscription(subscription, String(object.client_reference_id || object.metadata?.firebase_uid || ''));
    }
  } else if (String(event.type || '').startsWith('customer.subscription.')) {
    await syncSubscription(object);
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscription = await subscriptionForEvent(object);
    if (subscription) await syncSubscription(subscription);
  }

  if (eventId) {
    await eventReference.set({ type: String(event.type || ''), processedAt: FieldValue.serverTimestamp() });
  }
  return json(res, 200, { received: true });
}

async function reserveUsage(uid: string, requestedSeconds: number): Promise<{ reservationId: string; status: ReturnType<typeof publicBillingStatus> }> {
  const firestore = getFirestore(getAdminApp());
  const billingReference = firestore.collection('sonaraBilling').doc(uid);
  const reservationReference = billingReference.collection('reservations').doc();
  let status!: ReturnType<typeof publicBillingStatus>;

  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(billingReference);
    const previous = snapshot.exists ? snapshot.data() as BillingRecord : {};
    const planId = effectivePlan(previous);
    const plan = SONARA_PLANS[planId];
    if (requestedSeconds > plan.maxTrackSeconds) {
      const error = new Error('TRACK_DURATION_LIMIT');
      (error as any).details = { planId, maxTrackSeconds: plan.maxTrackSeconds };
      throw error;
    }

    const now = Date.now();
    const defaultPeriod = monthPeriod();
    let periodStart = timestampToMillis(previous.usagePeriodStart) || defaultPeriod.start.getTime();
    let periodEnd = timestampToMillis(previous.usagePeriodEnd) || defaultPeriod.end.getTime();
    let usageSeconds = Math.max(0, Number(previous.usageSeconds || 0));
    if (now >= periodEnd) {
      const next = monthPeriod();
      periodStart = next.start.getTime();
      periodEnd = next.end.getTime();
      usageSeconds = 0;
    }
    if (usageSeconds + requestedSeconds > plan.includedSeconds) {
      const error = new Error('USAGE_LIMIT_REACHED');
      (error as any).details = { planId, usedSeconds: usageSeconds, includedSeconds: plan.includedSeconds };
      throw error;
    }

    const nextRecord: BillingRecord = {
      ...previous,
      planId: previous.planId || 'free',
      subscriptionStatus: previous.subscriptionStatus || 'free',
      usageSeconds: usageSeconds + requestedSeconds,
      usagePeriodStart: Timestamp.fromMillis(periodStart),
      usagePeriodEnd: Timestamp.fromMillis(periodEnd)
    };
    transaction.set(billingReference, { ...nextRecord, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(reservationReference, {
      seconds: requestedSeconds,
      status: 'reserved',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + 2 * 60 * 60 * 1000)
    });
    status = publicBillingStatus(nextRecord);
  });
  return { reservationId: reservationReference.id, status };
}

async function finishReservation(uid: string, reservationId: string, outcome: 'committed' | 'released') {
  const firestore = getFirestore(getAdminApp());
  const billingReference = firestore.collection('sonaraBilling').doc(uid);
  const reservationReference = billingReference.collection('reservations').doc(reservationId);
  await firestore.runTransaction(async transaction => {
    const [billingSnapshot, reservationSnapshot] = await Promise.all([
      transaction.get(billingReference),
      transaction.get(reservationReference)
    ]);
    if (!reservationSnapshot.exists || reservationSnapshot.data()?.status !== 'reserved') return;
    const seconds = Math.max(0, Number(reservationSnapshot.data()?.seconds || 0));
    if (outcome === 'released') {
      const used = Math.max(0, Number(billingSnapshot.data()?.usageSeconds || 0));
      transaction.set(billingReference, { usageSeconds: Math.max(0, used - seconds), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    transaction.set(reservationReference, { status: outcome, finishedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

function generationPercentage(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 50;
}

async function proxyGeneration(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const requestedSeconds = Math.max(30, Math.min(480, Math.round(Number(body.durationSec ?? body.duration ?? 30))));
  const weirdness = generationPercentage(body.weirdness);
  const styleInfluence = generationPercentage(body.styleInfluence ?? body.style_influence);
  const enforcement = enforcementMode();
  let reservation: { reservationId: string; status: ReturnType<typeof publicBillingStatus> } | null = null;

  try {
    const billingRecord = await getBillingRecord(user.uid);
    const planId = effectivePlan(billingRecord);
    const plan = SONARA_PLANS[planId];
    if (requestedSeconds > plan.maxTrackSeconds) {
      return errorResponse(res, 403, 'TRACK_DURATION_LIMIT', 'La durata richiesta supera il limite del piano attivo.', {
        planId,
        maxTrackSeconds: plan.maxTrackSeconds
      });
    }
  } catch {
    return errorResponse(res, 503, 'BILLING_ENTITLEMENT_CHECK_FAILED', 'Il controllo del piano non è momentaneamente disponibile.');
  }

  if (billingStoreReady() && enforcement !== 'observe') {
    try {
      reservation = await reserveUsage(user.uid, requestedSeconds);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'BILLING_ERROR';
      const details = (error as any)?.details || {};
      if (code === 'TRACK_DURATION_LIMIT') {
        return errorResponse(res, 403, code, 'La durata richiesta supera il limite del piano attivo.', details);
      }
      if (code === 'USAGE_LIMIT_REACHED') {
        return errorResponse(res, 402, code, 'Hai terminato i minuti inclusi nel piano corrente.', details);
      }
      if (enforcement === 'enforce') throw error;
    }
  } else if (enforcement === 'enforce') {
    return errorResponse(res, 503, 'BILLING_STORE_NOT_CONFIGURED', 'Il controllo delle quote non è disponibile.');
  }

  const engineBaseUrl = String(process.env.SONARA_ENGINE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (internalSecret) headers['X-Sonara-Internal-Secret'] = internalSecret;

  try {
    const engineResponse = await fetch(`${engineBaseUrl}/api/engine/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...body,
        durationSec: requestedSeconds,
        duration: requestedSeconds,
        weirdness,
        styleInfluence
      })
    });
    const raw = await engineResponse.text();
    if (!engineResponse.ok && reservation) await finishReservation(user.uid, reservation.reservationId, 'released');
    if (engineResponse.ok && reservation) await finishReservation(user.uid, reservation.reservationId, 'committed');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', engineResponse.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('X-Sonara-Billing', reservation ? 'metered' : 'observe');
    return res.status(engineResponse.status).send(raw);
  } catch (error) {
    if (reservation) await finishReservation(user.uid, reservation.reservationId, 'released').catch(() => undefined);
    return errorResponse(res, 502, 'ENGINE_PROXY_FAILED', 'SONARA non riesce a raggiungere il motore di generazione.');
  }
}

export default async function handler(req: any, res: any) {
  const action = actionFromRequest(req);
  try {
    if (req.method === 'GET' && action === 'health') {
      return json(res, 200, {
        service: 'sonara-billing',
        ready: webhookReady(),
        checks: {
          firebaseAdmin: billingStoreReady(),
          stripeSecret: Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim()),
          webhookSecret: Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()),
          prices: configuredPriceIds().length === 4,
          legal: legalPublicationReady() && Boolean(legalVersion() && termsUrl() && privacyUrl())
        }
      });
    }
    if (req.method === 'POST' && action === 'webhook') return await handleWebhook(req, res);

    const user = await authenticatedUser(req);
    if (!user) return errorResponse(res, 401, 'AUTH_TOKEN_INVALID', 'Accedi con un account SONARA valido.');

    if (req.method === 'GET' && action === 'status') {
      const record = await getBillingRecord(user.uid);
      return json(res, 200, { billing: publicBillingStatus(record) });
    }
    if (req.method === 'POST' && action === 'checkout') {
      return await createCheckout(user, await readJsonBody(req), res);
    }
    if (req.method === 'POST' && action === 'portal') {
      return await createPortal(user, res);
    }
    if (req.method === 'POST' && action === 'generate') {
      return await proxyGeneration(user, await readJsonBody(req), res);
    }
    return errorResponse(res, 404, 'BILLING_ROUTE_NOT_FOUND', 'Rotta pagamenti SONARA non trovata.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INVALID_JSON') return errorResponse(res, 400, 'INVALID_JSON', 'Corpo JSON non valido.');
    if (message === 'REQUEST_TOO_LARGE') return errorResponse(res, 413, 'REQUEST_TOO_LARGE', 'Richiesta troppo grande.');
    console.error('[SONARA BILLING]', message);
    return errorResponse(res, 500, 'BILLING_INTERNAL_ERROR', 'Il servizio pagamenti non è disponibile in questo momento.');
  }
}
