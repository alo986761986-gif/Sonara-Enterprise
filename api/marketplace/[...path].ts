import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: false } };

const DEFAULT_APP_URL = 'https://sonaraenterprise.com';
const DEFAULT_TERMS_URL = `${DEFAULT_APP_URL}/terms`;
const DEFAULT_PRIVACY_URL = `${DEFAULT_APP_URL}/privacy`;

interface AuthenticatedUser {
  uid: string;
  email?: string;
}

interface MarketplaceProduct {
  id: string;
  name: string;
  description: string;
  category: 'custom-services';
  unitAmount: number;
  currency: 'eur';
  fulfilment: string;
  commercialUse: boolean;
}

const MARKETPLACE_PRODUCTS: Record<string, MarketplaceProduct> = {
  'custom-track': {
    id: 'custom-track',
    name: 'SONARA Custom Track',
    description: 'Brano originale realizzato su brief del cliente. Il lavoro parte dopo la conferma del pagamento e la ricezione del brief creativo.',
    category: 'custom-services',
    unitAmount: 9900,
    currency: 'eur',
    fulfilment: 'Brief creativo richiesto dopo il pagamento.',
    commercialUse: true
  },
  'mixing-mastering': {
    id: 'mixing-mastering',
    name: 'SONARA Mixing & Mastering',
    description: 'Servizio professionale di mixing e mastering sul file audio fornito dal cliente.',
    category: 'custom-services',
    unitAmount: 3999,
    currency: 'eur',
    fulfilment: 'File audio e indicazioni richiesti dopo il pagamento.',
    commercialUse: true
  }
};

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return existing;
  }

  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();

  adminApp = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(projectId ? { projectId } : {})
  });
  return adminApp;
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function errorResponse(res: any, status: number, code: string, message: string) {
  return json(res, status, { error: { code, message } });
}

async function readRawBody(req: any, maxBytes = 256 * 1024): Promise<Buffer> {
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

async function readJsonBody(req: any): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function bearerToken(req: any): string {
  return String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function authenticatedUser(req: any): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!token || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string; email?: string }> };
    const user = payload.users?.[0];
    return user?.localId ? { uid: user.localId, email: user.email } : null;
  } catch {
    return null;
  }
}

function actionFromRequest(req: any): string {
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (queryPath) return queryPath.replace(/^\/+|\/+$/g, '').toLowerCase();
  const pathname = String(req.url || req.originalUrl || '').split(/[?#]/, 1)[0];
  const match = pathname.match(/\/api\/marketplace(?:\/(.*))?\/?$/i);
  return String(match?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

async function stripeRequest(path: string, init: { method?: string; form?: URLSearchParams } = {}): Promise<any> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('STRIPE_NOT_CONFIGURED');
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    ...(init.form ? { body: init.form.toString() } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || `Stripe HTTP ${response.status}`));
  return payload;
}

function publicCatalog() {
  return Object.values(MARKETPLACE_PRODUCTS).map(product => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    unitAmount: product.unitAmount,
    currency: product.currency,
    fulfilment: product.fulfilment,
    commercialUse: product.commercialUse
  }));
}

async function createCheckout(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const product = MARKETPLACE_PRODUCTS[String(body.productId || '')];
  if (!product) return errorResponse(res, 400, 'INVALID_PRODUCT', 'Prodotto Marketplace non valido.');
  if (!String(process.env.STRIPE_SECRET_KEY || '').trim()) {
    return errorResponse(res, 503, 'MARKETPLACE_PAYMENTS_NOT_CONFIGURED', 'I pagamenti Marketplace non sono configurati.');
  }

  const appUrl = String(process.env.SONARA_APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  const termsUrl = String(process.env.SONARA_TERMS_URL || DEFAULT_TERMS_URL).trim();
  const privacyUrl = String(process.env.SONARA_PRIVACY_URL || DEFAULT_PRIVACY_URL).trim();
  const form = new URLSearchParams({
    mode: 'payment',
    client_reference_id: user.uid,
    success_url: `${appUrl}/?marketplace=success&marketplace_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?marketplace=cancelled`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': product.currency,
    'line_items[0][price_data][unit_amount]': String(product.unitAmount),
    'line_items[0][price_data][product_data][name]': product.name,
    'line_items[0][price_data][product_data][description]': product.description,
    'consent_collection[terms_of_service]': 'required',
    'metadata[firebase_uid]': user.uid,
    'metadata[sonara_marketplace_product]': product.id,
    'metadata[sonara_marketplace_category]': product.category,
    'metadata[sonara_terms_url]': termsUrl,
    'metadata[sonara_privacy_url]': privacyUrl,
    'payment_intent_data[metadata][firebase_uid]': user.uid,
    'payment_intent_data[metadata][sonara_marketplace_product]': product.id
  });
  if (user.email) form.set('customer_email', user.email);
  if (String(process.env.STRIPE_AUTOMATIC_TAX || '').toLowerCase() === 'true') {
    form.set('automatic_tax[enabled]', 'true');
  }

  const session = await stripeRequest('/v1/checkout/sessions', { method: 'POST', form });
  return json(res, 200, { url: session.url, sessionId: session.id });
}

async function verifyPurchase(user: AuthenticatedUser, req: any, res: any) {
  const sessionId = String(req.query?.session_id || req.query?.sessionId || '').trim();
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return errorResponse(res, 400, 'INVALID_SESSION', 'Sessione Marketplace non valida.');
  }

  const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const uid = String(session?.client_reference_id || session?.metadata?.firebase_uid || '').trim();
  const productId = String(session?.metadata?.sonara_marketplace_product || '').trim();
  const product = MARKETPLACE_PRODUCTS[productId];

  if (!uid || uid !== user.uid) return errorResponse(res, 403, 'PURCHASE_OWNER_MISMATCH', 'Questa transazione non appartiene al tuo account.');
  if (!product || session?.mode !== 'payment') return errorResponse(res, 400, 'PURCHASE_PRODUCT_INVALID', 'Prodotto Marketplace non riconosciuto.');

  const paid = String(session?.payment_status || '').toLowerCase() === 'paid';
  if (!paid) {
    return json(res, 200, { paid: false, paymentStatus: String(session?.payment_status || 'unpaid') });
  }

  const amountTotal = Number(session?.amount_total || 0);
  const currency = String(session?.currency || '').toLowerCase();
  if (amountTotal !== product.unitAmount || currency !== product.currency) {
    return errorResponse(res, 409, 'PURCHASE_AMOUNT_MISMATCH', 'Importo della transazione non coerente con il catalogo SONARA.');
  }

  const orderRef = getFirestore(getAdminApp())
    .collection('sonaraMarketplaceCustomers')
    .doc(user.uid)
    .collection('orders')
    .doc(sessionId);

  await orderRef.set({
    sessionId,
    productId: product.id,
    productName: product.name,
    category: product.category,
    amountTotal,
    currency,
    paymentStatus: 'paid',
    serviceStatus: 'paid_pending_customer_materials',
    fulfilment: product.fulfilment,
    commercialUse: product.commercialUse,
    stripePaymentIntentId: typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id || null,
    customerEmail: user.email || session?.customer_details?.email || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return json(res, 200, {
    paid: true,
    order: {
      sessionId,
      productId: product.id,
      productName: product.name,
      amountTotal,
      currency,
      serviceStatus: 'paid_pending_customer_materials',
      fulfilment: product.fulfilment
    }
  });
}

async function listOrders(user: AuthenticatedUser, res: any) {
  const snapshot = await getFirestore(getAdminApp())
    .collection('sonaraMarketplaceCustomers')
    .doc(user.uid)
    .collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(25)
    .get();

  const orders = snapshot.docs.map(doc => {
    const data = doc.data();
    const createdAt = data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : null;
    return {
      id: doc.id,
      productId: data.productId,
      productName: data.productName,
      amountTotal: Number(data.amountTotal || 0),
      currency: String(data.currency || 'eur'),
      paymentStatus: String(data.paymentStatus || ''),
      serviceStatus: String(data.serviceStatus || ''),
      fulfilment: String(data.fulfilment || ''),
      createdAt
    };
  });
  return json(res, 200, { orders });
}

export default async function handler(req: any, res: any) {
  const action = actionFromRequest(req);
  try {
    if (req.method === 'GET' && (action === '' || action === 'catalog')) {
      return json(res, 200, {
        marketplace: 'SONARA Store',
        assetPolicy: 'verified-assets-only',
        creatorCommissionPlannedPercent: 15,
        products: publicCatalog(),
        categories: [
          { id: 'music-licensing', name: 'Music Licensing', liveListings: 0 },
          { id: 'stems-samples', name: 'Stems & Samples', liveListings: 0 },
          { id: 'vocals-presets', name: 'Vocals & Presets', liveListings: 0 },
          { id: 'custom-services', name: 'Custom Services', liveListings: publicCatalog().length }
        ]
      });
    }
    if (req.method === 'GET' && action === 'health') {
      return json(res, 200, {
        service: 'sonara-marketplace',
        ready: Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim() && String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()),
        stripe: Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim()),
        firebaseAdmin: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim())
      });
    }

    const user = await authenticatedUser(req);
    if (!user) return errorResponse(res, 401, 'AUTH_TOKEN_INVALID', 'Accedi con un account SONARA valido.');

    if (req.method === 'POST' && action === 'checkout') return await createCheckout(user, await readJsonBody(req), res);
    if (req.method === 'GET' && action === 'verify') return await verifyPurchase(user, req, res);
    if (req.method === 'GET' && action === 'orders') return await listOrders(user, res);

    return errorResponse(res, 404, 'MARKETPLACE_ROUTE_NOT_FOUND', 'Rotta Marketplace SONARA non trovata.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INVALID_JSON') return errorResponse(res, 400, 'INVALID_JSON', 'Corpo JSON non valido.');
    if (message === 'REQUEST_TOO_LARGE') return errorResponse(res, 413, 'REQUEST_TOO_LARGE', 'Richiesta troppo grande.');
    if (message === 'STRIPE_NOT_CONFIGURED') return errorResponse(res, 503, 'MARKETPLACE_PAYMENTS_NOT_CONFIGURED', 'Pagamenti Marketplace non configurati.');
    console.error('[SONARA MARKETPLACE]', message);
    return errorResponse(res, 500, 'MARKETPLACE_INTERNAL_ERROR', 'Il Marketplace non è disponibile in questo momento.');
  }
}
