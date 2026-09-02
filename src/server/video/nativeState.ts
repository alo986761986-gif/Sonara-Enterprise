import { randomUUID } from 'node:crypto';
import type { SonaraPlanId, SonaraVideoResolution } from '../../billing/plans';

const SONARA_PUBLIC_ORIGIN = 'https://sonaraenterprise.com';

type NativeBilling = {
  planId: SonaraPlanId;
  planName: string;
  videoCreditsPerMonth: number;
  videoCreditsUsed: number;
  videoCreditsRemaining: number;
  videoClipSeconds: number;
  videoResolutions: SonaraVideoResolution[];
  providerConfigured?: boolean;
};

export type NativeVideoReservation = {
  reservationId: string;
  credits: number;
  planId: SonaraPlanId;
  status: NativeBilling;
};

function headerValue(req: any, name: string): string {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

function jsonSafe(value: any): any {
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (!value || typeof value !== 'object') return value;
  const constructorName = String(value?.constructor?.name || '');
  if (constructorName === 'ServerTimestampTransform') return new Date().toISOString();
  if (constructorName === 'DeleteTransform') return { __sonaraDelete: true };
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
}

async function nativeStateRequest(req: any, path: string, init: RequestInit = {}) {
  const cookie = headerValue(req, 'cookie');
  if (!cookie) throw Object.assign(new Error('Sessione SONARA non disponibile.'), { code: 'AUTH_REQUIRED', status: 401 });
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Cookie', cookie);
  headers.set('Cache-Control', 'no-store');
  const response = await fetch(`${SONARA_PUBLIC_ORIGIN}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000)
  });
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = String(payload?.message || payload?.error?.message || `Stato Video AI non disponibile (HTTP ${response.status}).`);
    throw Object.assign(new Error(message), { code: String(payload?.code || payload?.error?.code || 'VIDEO_STATE_ERROR'), status: response.status, payload });
  }
  return payload;
}

export async function reserveNativeVideoCredits(req: any, resolution: SonaraVideoResolution): Promise<NativeVideoReservation> {
  const payload = await nativeStateRequest(req, '/api/sonara-auth/video-reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution })
  });
  const billing = payload.billing as NativeBilling;
  return {
    reservationId: String(payload.reservationId || ''),
    credits: Math.max(0, Number(payload.credits || 0)),
    planId: billing.planId,
    status: billing
  };
}

export async function cancelNativeVideoReservation(req: any, reservationId: string) {
  if (!reservationId) return;
  await nativeStateRequest(req, '/api/sonara-auth/video-reservation/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationId })
  });
}

export async function createNativeVideoJob(req: any, record: Record<string, any>, reservationId: string) {
  const jobId = randomUUID();
  await nativeStateRequest(req, '/api/sonara-auth/video-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, reservationId, record: jsonSafe(record) })
  });
  return jobId;
}

export function nativeVideoJobRef(req: any, jobId: string) {
  return {
    async get() {
      try {
        const payload = await nativeStateRequest(req, `/api/sonara-auth/video-job?id=${encodeURIComponent(jobId)}`);
        return { exists: true, data: () => payload.job };
      } catch (cause: any) {
        if (Number(cause?.status || 0) === 404) return { exists: false, data: () => undefined };
        throw cause;
      }
    },
    async set(updates: Record<string, any>, _options?: { merge?: boolean }) {
      await nativeStateRequest(req, '/api/sonara-auth/video-job', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, updates: jsonSafe(updates) })
      });
    }
  };
}

export async function refundNativeVideoJob(req: any, jobId: string) {
  if (!jobId) return;
  await nativeStateRequest(req, '/api/sonara-auth/video-job/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId })
  });
}

export function nativeMolabVideoUrl(operationName: string) {
  const jobId = String(operationName || '').trim().replace(/\.mp4$/i, '');
  return `/api/video/file/${encodeURIComponent(jobId)}.mp4`;
}
