import { createHash } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const TARGET_EMAIL_SHA256 = '8a64bc10f7bc69a62820946de1fe6358a9f96c09ca94a612225cae0e82610cb5';
const ONE_TIME_TOKEN = 'studio-gift-20260827-7d2f8b14c9a6418f';

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();
  return initializeApp({
    credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
    ...(projectId ? { projectId } : {})
  });
}

function hashEmail(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function findTargetUser() {
  const auth = getAuth(app());
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    const found = page.users.find(user => user.email && hashEmail(user.email) === TARGET_EMAIL_SHA256);
    if (found) return found;
    token = page.pageToken;
  } while (token);
  return null;
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

  const user = await findTargetUser();
  if (!user) return res.status(404).json({ ok: false, code: 'TARGET_ACCOUNT_NOT_FOUND' });

  const db = getFirestore(app());
  const ref = db.collection('sonaraBilling').doc(user.uid);
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
}
