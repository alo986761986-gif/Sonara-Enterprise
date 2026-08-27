import { getFirebaseIdToken } from '../../lib/firebaseClient';

export interface Hub { id: string; name: string; country: string; flag: string; latitude: number; longitude: number; }
export interface Profile { uid: string; displayName: string; photoURL: string; bio: string; role: string; genres: string[]; languages: string[]; cityId: string | null; city: string; country: string; flag: string; latitude: number | null; longitude: number | null; discoverable: boolean; online: boolean; }
export interface Thread { id: string; name: string; isGroup: boolean; participants: Profile[]; lastMessage: string; updatedAt: string | null; }
export interface Message { id: string; senderUid: string; text: string; attachmentUrl?: string; attachmentType?: string; attachmentName?: string; createdAt?: string | null; optimistic?: boolean; }
export interface Collaboration { id: string; ownerUid: string; owner?: Profile | null; title: string; description: string; genre: string; roleWanted: string; language: string; bpm: number; createdAt?: string | null; }
export interface Match { profile: Profile; score: number; }
export interface Room { id: string; name: string; kind: string; genre: string; ownerUid: string; participantCount: number; participantUids: string[]; updatedAt?: string | null; }
export interface DashboardData { stats?: { discoverableCreators?: number; onlineCreators?: number; openCollaborations?: number; activeRooms?: number }; topGenres?: Array<{ name: string; count: number }>; topCities?: Array<{ name: string; count: number }>; }

const TIMEOUT_MS = 15_000;

function messageFromPayload(payload: any, status: number) {
  return payload?.error?.message || payload?.message || `SONARA Social HTTP ${status}`;
}

async function requestOnce(path: string, init: RequestInit, forceRefresh: boolean, signal: AbortSignal) {
  const token = await getFirebaseIdToken(forceRefresh);
  const response = await fetch(`/api/social/${path}`, {
    ...init,
    signal,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export async function socialFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    let { response, payload } = await requestOnce(path, init, false, controller.signal);
    if (response.status === 401 && !controller.signal.aborted) {
      ({ response, payload } = await requestOnce(path, init, true, controller.signal));
    }
    if (!response.ok) throw new Error(messageFromPayload(payload, response.status));
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Scoperta non ha risposto in tempo. Controlla la connessione e riprova.');
    const message = error instanceof Error ? error.message : String(error);
    if (/Accedi per usare Ember/i.test(message)) throw new Error('Accedi a SONARA per usare Scoperta e la chat.');
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) throw new Error('Connessione a SONARA Social non disponibile. Riprova tra qualche secondo.');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function formatSocialTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const age = now - date.getTime();
  if (age < 60_000) return 'adesso';
  if (age < 3_600_000) return `${Math.max(1, Math.floor(age / 60_000))} min`;
  if (age < 86_400_000) return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}
