import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SonaraAuthStore } from './sonara-native-auth-safe.mjs';

const uid = 'owner-video-test';
const email = 'owner-test@example.invalid';
const token = 'native-video-test-session';
const hash = value => createHash('sha256').update(value).digest('hex');
const values = new Map();
const storage = {
  get: async key => values.get(key),
  put: async (key, value) => { values.set(key, structuredClone(value)); },
  delete: async key => { values.delete(key); }
};

const userKey = `user:${hash(email)}`;
const now = Date.now();
values.set(userKey, {
  uid,
  email,
  status: 'active',
  createdAt: now,
  entitlement: { planId: 'studio', cadence: 'yearly', status: 'active', expiresAt: now + 86_400_000, source: 'legacy-studio-restoration-2026-08-31' },
  videoCreditsUsed: 0
});
values.set(`session:${hash(token)}`, { uid, userKey, expiresAt: now + 60_000 });

const store = new SonaraAuthStore({ storage }, {});
const request = (path, init = {}) => new Request(`https://sonaraenterprise.com${path}`, {
  ...init,
  headers: { Cookie: `sonara_session=${token}`, ...(init.headers || {}) }
});

const statusResponse = await store.fetch(request('/api/video/status'));
assert.equal(statusResponse.status, 200);
const status = await statusResponse.json();
assert.equal(status.planId, 'studio');
assert.equal(status.videoCreditsPerMonth, 10_000);
assert.equal(status.videoCreditsRemaining, 10_000);

const reserveResponse = await store.fetch(request('/api/sonara-auth/video-reserve', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution: '720p' })
}));
assert.equal(reserveResponse.status, 200);
const reserved = await reserveResponse.json();
assert.equal(reserved.credits, 1);
assert.equal(reserved.billing.videoCreditsRemaining, 9_999);

const jobId = 'native_video_job_1234';
const createResponse = await store.fetch(request('/api/sonara-auth/video-job', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    jobId,
    reservationId: reserved.reservationId,
    record: { prompt: 'A cinematic ocean scene', resolution: '720p', provider: 'molab', model: 'wan2.2-ti2v-5b' }
  })
}));
assert.equal(createResponse.status, 200);

const patchResponse = await store.fetch(request('/api/sonara-auth/video-job', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, updates: { status: 'FAILED', error: 'test failure' } })
}));
assert.equal(patchResponse.status, 200);

const refundResponse = await store.fetch(request('/api/sonara-auth/video-job/refund', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId })
}));
assert.equal(refundResponse.status, 200);
const refunded = await refundResponse.json();
assert.equal(refunded.refunded, true);
assert.equal(refunded.billing.videoCreditsRemaining, 10_000);

console.log('SONARA native owner has durable 10000 Video AI credits and job state.');
