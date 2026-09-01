import type { SonaraPlanId } from '../../billing/plans';

const SONARA_PUBLIC_ORIGIN = 'https://sonaraenterprise.com';

export interface AuthenticatedVideoUser {
  uid: string;
  email?: string;
  native: boolean;
  planId?: SonaraPlanId;
  videoCreditsPerMonthOverride?: number;
}

type NativeSessionPayload = {
  authenticated?: boolean;
  user?: {
    uid?: string;
    email?: string;
    planId?: SonaraPlanId;
  };
};

function headerValue(req: any, name: string): string {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function bearerToken(req: any): string {
  return headerValue(req, 'authorization').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function nativeSessionUser(req: any): Promise<AuthenticatedVideoUser | null> {
  const cookie = headerValue(req, 'cookie');
  if (!cookie) return null;

  try {
    const response = await fetch(`${SONARA_PUBLIC_ORIGIN}/api/sonara-auth/session`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Cookie: cookie,
        'Cache-Control': 'no-store'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as NativeSessionPayload;
    const sessionUser = payload?.user;
    const uid = String(sessionUser?.uid || '').trim();
    const email = String(sessionUser?.email || '').trim().toLowerCase();
    if (!payload?.authenticated || !uid) return null;
    const planId: SonaraPlanId = sessionUser?.planId === 'studio' ? 'studio' : 'free';
    return {
      uid,
      ...(email ? { email } : {}),
      native: true,
      planId
    };
  } catch {
    return null;
  }
}

export async function authenticatedNativeVideoUser(req: any): Promise<AuthenticatedVideoUser | null> {
  return nativeSessionUser(req);
}

export async function authenticatedVideoUser(req: any): Promise<AuthenticatedVideoUser | null> {
  // A native user is authenticated by the Secure/HttpOnly SONARA cookie. The
  // public Authorization header is neither trusted nor treated as a credential.
  const native = await nativeSessionUser(req);
  if (native) return native;

  const token = bearerToken(req);
  if (!token) return null;

  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string; email?: string }> };
    const user = payload.users?.[0];
    return user?.localId
      ? { uid: user.localId, email: user.email, native: false }
      : null;
  } catch {
    return null;
  }
}

export function trustedVideoBillingRecord<T extends Record<string, any>>(
  user: AuthenticatedVideoUser,
  record: T
): T {
  if (!user.native) return record;
  const planId: SonaraPlanId = user.planId === 'studio' ? 'studio' : 'free';
  const override = Math.max(
    0,
    Number(record?.videoCreditsPerMonthOverride || 0),
    Number(user.videoCreditsPerMonthOverride || 0)
  );
  return {
    ...record,
    planId,
    subscriptionStatus: planId === 'studio' ? 'active' : 'free',
    ...(override > 0 ? { videoCreditsPerMonthOverride: override } : {})
  };
}
