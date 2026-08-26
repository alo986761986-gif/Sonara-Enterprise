import { createHash, createSign } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const TARGET_EMAIL_SHA256 = '8a64bc10f7bc69a62820946de1fe6358a9f96c09ca94a612225cae0e82610cb5';
const TARGET_EMAIL = 'antonio.maresca2002@gmail.com';
const ONE_TIME_TOKEN = 'studio-gift-20260827-2f934f70e8ad4b56';

function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_MISSING');
  return JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
}

function projectId() {
  const sa = serviceAccount();
  return String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    sa.project_id ||
    ''
  ).trim();
}

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  return initializeApp({
    credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
    ...(projectId() ? { projectId: projectId() } : {})
  });
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function googleAccessToken() {
  const sa = serviceAccount();
  if (!sa.client_email || !sa.private_key) throw new Error('SERVICE_ACCOUNT_FIELDS_MISSING');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${b64url(signer.sign(sa.private_key))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(`GOOGLE_OAUTH_FAILED:${data.error || response.status}:${data.error_description || ''}`);
  return data.access_token;
}

function hashEmail(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function findTargetUser() {
  if (hashEmail(TARGET_EMAIL) !== TARGET_EMAIL_SHA256) throw new Error('TARGET_HASH_MISMATCH');
  const token = await googleAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/accounts:lookup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: [TARGET_EMAIL] })
  });
  const data = await response.json() as { users?: Array<{ localId?: string; email?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`IDENTITY_LOOKUP_FAILED:${response.status}:${data.error?.message || ''}`);
  return data.users?.find(user => user.localId && user.email && hashEmail(user.email) === TARGET_EMAIL_SHA256) || null;
}

function millis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis());
  if (typeof value._seconds === 'number') return Number(value._seconds) * 1000;
  return 0;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
  if (String(req.query?.token || '') !== ONE_TIME_TOKEN) return res.status(403).json({ ok: false, code: 'FORBIDDEN' });

  try {
    const user = await findTargetUser();
    if (!user?.localId) return res.status(404).json({ ok: false, code: 'TARGET_ACCOUNT_NOT_FOUND' });

    const db = getFirestore(app());
    const ref = db.collection('sonaraBilling').doc(user.localId);
    const snap = await ref.get();
    const current: any = snap.exists ? snap.data() || {} : {};
    const endMillis = millis(current.usagePeriodEnd);
    const paidNow = (current.planId === 'creator' || current.planId === 'studio') && (
      current.subscriptionStatus === 'active' ||
      current.subscriptionStatus === 'trialing' ||
      (current.subscriptionStatus === 'past_due' && endMillis > Date.now())
    );

    if (paidNow && current.stripeSubscriptionId) {
      return res.status(409).json({ ok: false, code: 'ACTIVE_PAID_SUBSCRIPTION_EXISTS' });
    }
    if (paidNow && current.giftGrant?.kind === 'studio_one_month') {
      return res.status(200).json({
        ok: true,
        alreadyGranted: true,
        planId: 'studio',
        expiresAt: current.giftGrant?.expiresAt?.toDate?.()?.toISOString?.() || null,
        renewal: false,
        charged: false
      });
    }

    const start = new Date();
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    await ref.set({
      planId: 'studio',
      cadence: 'monthly',
      subscriptionStatus: 'past_due',
      usageSeconds: 0,
      usagePeriodStart: Timestamp.fromDate(start),
      usagePeriodEnd: Timestamp.fromDate(end),
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: FieldValue.delete(),
      stripePriceId: FieldValue.delete(),
      giftGrant: {
        kind: 'studio_one_month',
        grantedAt: Timestamp.fromDate(start),
        expiresAt: Timestamp.fromDate(end),
        renewal: false,
        charge: false
      },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      planId: 'studio',
      start: start.toISOString(),
      expiresAt: end.toISOString(),
      renewal: false,
      charged: false
    });
  } catch (error: any) {
    console.error('[studio-gift]', error?.stack || error);
    return res.status(500).json({ ok: false, code: 'GIFT_GRANT_FAILED' });
  }
}
