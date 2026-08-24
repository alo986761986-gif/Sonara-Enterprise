import { createHmac } from 'node:crypto';
import { normalizeStripeCatalogEnvironment } from '../../src/billing/stripeCatalogServer';
import billingHandler from './[...path]';

export const config = { api: { bodyParser: false } };

async function readRawBody(req: any, maxBytes = 2 * 1024 * 1024): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function retrieveTrustedStripeEvent(eventId: string): Promise<any> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('STRIPE_NOT_CONFIGURED');

  const response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error?.message || `Stripe HTTP ${response.status}`));
  }
  if (payload?.id !== eventId) throw new Error('STRIPE_EVENT_ID_MISMATCH');
  return payload;
}

function trustedSignature(raw: Buffer): string {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET_MISSING');

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${raw.toString('utf8')}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function webhookError(res: any, status: number, code: string, message: string) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json({ error: { code, message } });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return webhookError(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo webhook non consentito.');
  }

  try {
    await normalizeStripeCatalogEnvironment();

    const incomingRaw = await readRawBody(req);
    const incomingEvent = JSON.parse(incomingRaw.toString('utf8'));
    const eventId = String(incomingEvent?.id || '').trim();
    if (!eventId.startsWith('evt_')) {
      return webhookError(res, 400, 'INVALID_STRIPE_EVENT', 'Evento Stripe non valido.');
    }

    const trustedEvent = await retrieveTrustedStripeEvent(eventId);
    if (incomingEvent?.type && trustedEvent?.type !== incomingEvent.type) {
      return webhookError(res, 400, 'STRIPE_EVENT_TYPE_MISMATCH', 'Tipo evento Stripe non valido.');
    }

    const trustedRaw = Buffer.from(JSON.stringify(trustedEvent));
    req.body = trustedRaw;
    req.headers = {
      ...(req.headers || {}),
      'stripe-signature': trustedSignature(trustedRaw)
    };

    return billingHandler(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[SONARA BILLING WEBHOOK]', message);
    const status = message === 'REQUEST_TOO_LARGE' ? 413 : 400;
    return webhookError(res, status, 'WEBHOOK_VERIFICATION_FAILED', 'Il webhook Stripe non è verificabile.');
  }
}
