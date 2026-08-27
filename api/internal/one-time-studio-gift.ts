import { createHash, timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const TOKEN_SHA256 = '0e79cc2a394c975f8223bbcde62c2daa37756c3edc23f488706fb3a985f14abf';
const GIFT_DAYS = 30;
const GIFT_GRANT_ID = 'studio-30d-2026-08-27';
let adminApp: App | null = null;

function projectId(): string {
  return String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) return (adminApp = existing);
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const id = projectId();
  adminApp = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(id ? { projectId: id } : {})
  });
  return adminApp;
}

function secureTokenMatches(value: unknown): boolean {
  const actualHex = createHash('sha256').update(String(value || '')).digest('hex');
  const expected = Buffer.from(TOKEN_SHA256, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function timestampMillis(value: any): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value.toMillis === 'function') return Number(value.toMillis());
  if (typeof value?._seconds === 'number') return Number(value._seconds) * 1000;
  return 0;
}

async function resolveUidByEmail(email: string): Promise<string> {
  const app = getAdminApp();
  const id = projectId() || String(app.options.projectId || '').trim();
  if (!id) throw new Error('FIREBASE_PROJECT_ID_MISSING');
  const credential = app.options.credential as any;
  const access = await credential?.getAccessToken?.();
  const accessToken = String(access?.access_token || '').trim();
  if (!accessToken) throw new Error('FIREBASE_ADMIN_ACCESS_TOKEN_MISSING');

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(id)}/accounts:lookup`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: [email] })
    }
  );
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `IDENTITY_TOOLKIT_HTTP_${response.status}`));
  }
  const uid = String(payload?.users?.[0]?.localId || '').trim();
  if (!uid) throw new Error('USER_NOT_FOUND');
  return uid;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!secureTokenMatches(req.query?.token)) return res.status(403).json({ error: 'FORBIDDEN' });

  const email = String(req.query?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'INVALID_EMAIL' });

  try {
    const app = getAdminApp();
    const uid = await resolveUidByEmail(email);
    const firestore = getFirestore(app);
    const ref = firestore.collection('sonaraBilling').doc(uid);
    const snapshot = await ref.get();
    const previous = snapshot.exists ? snapshot.data() || {} : {};

    const previousPeriodEnd = timestampMillis(previous.usagePeriodEnd);
    const existingPaid = Boolean(
      previous.stripeSubscriptionId &&
      (previous.subscriptionStatus === 'active' || previous.subscriptionStatus === 'trialing' ||
        (previous.subscriptionStatus === 'past_due' && previousPeriodEnd > Date.now()))
    );
    if (existingPaid) {
      return res.status(409).json({
        error: 'PAID_SUBSCRIPTION_ALREADY_ACTIVE',
        message: 'Account con abbonamento Stripe gia attivo: nessuna modifica applicata.'
      });
    }

    if (previous.giftGrantId === GIFT_GRANT_ID) {
      return res.status(200).json({
        ok: true,
        alreadyApplied: true,
        planId: previous.planId || 'studio',
        periodEnd: previousPeriodEnd ? new Date(previousPeriodEnd).toISOString() : null,
        autoRenew: false
      });
    }

    const start = Date.now();
    const end = start + GIFT_DAYS * 24 * 60 * 60 * 1000;
    await ref.set({
      planId: 'studio',
      cadence: 'monthly',
      subscriptionStatus: 'past_due',
      usageSeconds: 0,
      usagePeriodStart: Timestamp.fromMillis(start),
      usagePeriodEnd: Timestamp.fromMillis(end),
      cancelAtPeriodEnd: true,
      giftGrantId: GIFT_GRANT_ID,
      giftType: 'studio-30-days-no-renewal',
      giftAutoRenew: false,
      giftGrantedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      planId: 'studio',
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
      autoRenew: false,
      includedMinutes: 500,
      maxTrackMinutes: 8
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Nessun account SONARA registrato con questa email.' });
    }
    console.error('[SONARA GIFT]', message);
    return res.status(500).json({ error: 'GIFT_ACTIVATION_FAILED', message });
  }
}
