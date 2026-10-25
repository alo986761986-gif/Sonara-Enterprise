import { createHash, timingSafeEqual } from 'node:crypto';

const EXPECTED_HASH = '3e86bb4b6734e31befcc244570dc0cb48a63821f3514758d302b1cce19aa6c69';
const TARGET_EMAIL = 'Giovy1485@outlook.it';

function secureEqualHex(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  const token = String(req.query?.token || '').trim();
  const digest = createHash('sha256').update(token).digest('hex');
  if (!token || !secureEqualHex(digest, EXPECTED_HASH)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED' });

  const internalSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (!internalSecret) return json(res, 503, { ok: false, code: 'ADMIN_SECRET_UNAVAILABLE' });

  const native = await fetch('https://api.sonaraenterprise.com/api/sonara-auth/admin/grant-studio', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sonara-internal-secret': internalSecret
    },
    body: JSON.stringify({ email: TARGET_EMAIL, months: 1 })
  });
  const nativePayload = await native.json().catch(() => ({}));
  if (!native.ok || !nativePayload?.uid) {
    return json(res, native.status || 502, {
      ok: false,
      stage: 'native',
      code: nativePayload?.code || 'NATIVE_GRANT_FAILED',
      message: nativePayload?.message || 'Grant nativo non riuscito.'
    });
  }

  const billing = await fetch('https://sonaraenterprise.com/api/billing/admin-grant-studio', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sonara-internal-secret': internalSecret
    },
    body: JSON.stringify({
      uid: String(nativePayload.uid),
      months: 1,
      expiresAt: Date.parse(String(nativePayload.expiresAt || ''))
    })
  });
  const billingPayload = await billing.json().catch(() => ({}));
  if (!billing.ok) {
    return json(res, billing.status || 502, {
      ok: false,
      stage: 'billing',
      code: billingPayload?.error?.code || 'BILLING_GRANT_FAILED',
      message: billingPayload?.error?.message || 'Sincronizzazione billing non riuscita.',
      nativeExpiresAt: nativePayload.expiresAt
    });
  }

  return json(res, 200, {
    ok: true,
    email: TARGET_EMAIL,
    planId: 'studio',
    cadence: 'monthly',
    expiresAt: nativePayload.expiresAt,
    autoRenew: false,
    native: true,
    billing: true
  });
}
