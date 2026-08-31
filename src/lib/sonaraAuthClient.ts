import type { User } from 'firebase/auth';

export type SonaraAuthUser = Pick<User, 'uid' | 'email' | 'displayName'> & { createdAt?: number };

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(String(data?.message || data?.code || `HTTP ${response.status}`));
  }
  return data;
}

export const sonaraAuthConfigured = true;

export function watchSonaraUser(callback: (user: SonaraAuthUser | null) => void): () => void {
  let active = true;
  request('/api/sonara-auth/session', { method: 'GET' })
    .then(data => { if (active) callback(data?.authenticated ? data.user : null); })
    .catch(() => { if (active) callback(null); });
  return () => { active = false; };
}

export async function loginSonara(email: string, password: string): Promise<SonaraAuthUser> {
  const data = await request('/api/sonara-auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password })
  });
  return data.user as SonaraAuthUser;
}

export async function registerSonara(email: string, password: string): Promise<SonaraAuthUser> {
  const data = await request('/api/sonara-auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password })
  });
  return data.user as SonaraAuthUser;
}

export async function resetSonaraPassword(email: string): Promise<void> {
  await request('/api/sonara-auth/reset', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() })
  });
}

export async function logoutSonara(): Promise<void> {
  await request('/api/sonara-auth/logout', { method: 'POST', body: '{}' });
}
