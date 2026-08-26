'use strict';

const { createHash } = require('node:crypto');
const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

const TARGET_EMAIL_SHA256 = '8a64bc10f7bc69a62820946de1fe6358a9f96c09ca94a612225cae0e82610cb5';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function emailHash(value) {
  return createHash('sha256').update(normalizeEmail(value)).digest('hex');
}

function adminApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();
  if (!raw && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Firebase Admin credentials are not configured.');
  }
  return initializeApp({
    credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
    ...(projectId ? { projectId } : {})
  });
}

async function findUserByEmailHash(auth) {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const match = page.users.find(user => user.email && emailHash(user.email) === TARGET_EMAIL_SHA256);
    if (match) return match;
    pageToken = page.pageToken;
  } while (pageToken);
  return null;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis());
  if (typeof value._seconds === 'number') return Number(value._seconds) * 1000;
  return 0;
}

async function main() {
  const app = adminApp();
  const auth = getAuth(app);
  const user = await findUserByEmailHash(auth);
  if (!user) {
    throw new Error('TARGET_ACCOUNT_NOT_FOUND: the recipient must create/sign in to SONARA with the supplied email first.');
  }

  const db = getFirestore(app);
  const ref = db.collection('sonaraBilling').doc(user.uid);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() || {} : {};
  const currentEnd = timestampMillis(current.usagePeriodEnd);
  const currentPaid = (current.planId === 'creator' || current.planId === 'studio') &&
    (current.subscriptionStatus === 'active' || current.subscriptionStatus === 'trialing' ||
      (current.subscriptionStatus === 'past_due' && currentEnd > Date.now()));

  if (currentPaid && current.stripeSubscriptionId) {
    throw new Error('TARGET_HAS_ACTIVE_STRIPE_SUBSCRIPTION: refusing to overwrite a paid subscription.');
  }
  if (currentPaid && current.giftGrant?.kind === 'studio_one_month') {
    throw new Error('TARGET_ALREADY_HAS_ACTIVE_GIFT: refusing to extend the gift unintentionally.');
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
    }
  }, { merge: true });

  console.log(JSON.stringify({
    ok: true,
    uid: user.uid,
    planId: 'studio',
    start: start.toISOString(),
    end: end.toISOString(),
    renewal: false,
    charged: false
  }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
