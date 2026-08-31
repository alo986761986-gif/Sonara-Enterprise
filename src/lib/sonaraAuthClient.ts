import type { User } from 'firebase/auth';

export type SonaraAuthUser = Pick<User, 'uid' | 'email' | 'displayName'> & { createdAt?: number; planId?: 'free' | 'creator' | 'studio' };

const STUDIO_RESTORE_STORAGE_KEY = 'sonara.pendingStudioRestore';

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
    const error = new Error(String(data?.message || data?.code || `HTTP ${response.status}`));
    (error as any).code = data?.code;
    (error as any).status = response.status;
    throw error;
  }
  return data;
}

export const sonaraAuthConfigured = true;

function studioRestoreCodeFromHash(): string {
  if (typeof window === 'undefined') return '';
  const match = String(window.location.hash || '').match(/^#sonara-studio-restore=([^&]+)$/i);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1] || '').trim();
  } catch {
    return String(match[1] || '').trim();
  }
}

function rememberStudioRestoreCode(): string {
  if (typeof window === 'undefined') return '';
  const fromHash = studioRestoreCodeFromHash();
  if (fromHash) {
    try { window.sessionStorage.setItem(STUDIO_RESTORE_STORAGE_KEY, fromHash); } catch {}
    return fromHash;
  }
  try { return String(window.sessionStorage.getItem(STUDIO_RESTORE_STORAGE_KEY) || '').trim(); }
  catch { return ''; }
}

function clearStudioRestoreCode() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(STUDIO_RESTORE_STORAGE_KEY); } catch {}
  if (/^#sonara-studio-restore=/i.test(String(window.location.hash || ''))) {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  }
}

export async function restorePendingStudioEntitlement(): Promise<any | null> {
  const code = rememberStudioRestoreCode();
  if (!code) return null;
  try {
    const data = await request('/api/sonara-auth/restore-studio', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    clearStudioRestoreCode();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sonara:billing-updated', { detail: data?.billing || null }));
      window.dispatchEvent(new CustomEvent('sonara:studio-restored', { detail: data?.billing || null }));
    }
    return data;
  } catch (error) {
    const status = Number((error as any)?.status || 0);
    const codeValue = String((error as any)?.code || '');
    if (status === 401 || codeValue === 'AUTH_REQUIRED') return null;
    throw error;
  }
}

export function watchSonaraUser(callback: (user: SonaraAuthUser | null) => void): () => void {
  let active = true;
  rememberStudioRestoreCode();
  request('/api/sonara-auth/session', { method: 'GET' })
    .then(async data => {
      if (!active) return;
      if (!data?.authenticated) {
        callback(null);
        return;
      }
      let user = data.user as SonaraAuthUser;
      try {
        const restored = await restorePendingStudioEntitlement();
        if (restored?.user) user = restored.user as SonaraAuthUser;
      } catch (error) {
        console.error('[SONARA] Studio entitlement restoration failed', error);
      }
      if (active) callback(user);
    })
    .catch(() => { if (active) callback(null); });
  return () => { active = false; };
}

export async function loginSonara(email: string, password: string): Promise<SonaraAuthUser> {
  const data = await request('/api/sonara-auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password })
  });
  try {
    const restored = await restorePendingStudioEntitlement();
    if (restored?.user) return restored.user as SonaraAuthUser;
  } catch (error) {
    console.error('[SONARA] Studio entitlement restoration after login failed', error);
  }
  return data.user as SonaraAuthUser;
}

export async function registerSonara(email: string, password: string): Promise<SonaraAuthUser> {
  const data = await request('/api/sonara-auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password })
  });
  try {
    const restored = await restorePendingStudioEntitlement();
    if (restored?.user) return restored.user as SonaraAuthUser;
  } catch (error) {
    console.error('[SONARA] Studio entitlement restoration after registration failed', error);
  }
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
