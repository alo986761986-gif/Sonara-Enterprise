import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

type MediaKind = 'image' | 'video' | 'audio';

type AuthenticatedUser = { uid: string; email?: string };

let adminApp: App | null = null;

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function fail(res: any, status: number, code: string, message: string) {
  return json(res, status, { error: { code, message } });
}

function bearerToken(req: any) {
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

function storageBucketName() {
  return String(process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) return adminApp = existing;
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '').trim();
  const storageBucket = storageBucketName();
  adminApp = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    ...(projectId ? { projectId } : {}),
    ...(storageBucket ? { storageBucket } : {})
  });
  return adminApp;
}

function safeFileName(value: string) {
  const clean = String(value || 'media')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean.slice(0, 100) || 'media';
}

function mediaKind(value: unknown): MediaKind | null {
  return value === 'image' || value === 'video' || value === 'audio' ? value : null;
}

function validContentType(kind: MediaKind, contentType: string) {
  const normalized = String(contentType || '').toLowerCase();
  if (kind === 'image') return normalized.startsWith('image/');
  if (kind === 'video') return normalized.startsWith('video/');
  return normalized.startsWith('audio/') || normalized === 'application/ogg';
}

function maxBytes(kind: MediaKind) {
  if (kind === 'image') return 25 * 1024 * 1024;
  if (kind === 'video') return 300 * 1024 * 1024;
  return 250 * 1024 * 1024;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');

  const user = await authenticatedUser(req);
  if (!user) return fail(res, 401, 'AUTH_REQUIRED', 'Accedi a SONARA per caricare media Video AI.');

  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const bucketName = storageBucketName();
  if (!serviceAccountJson || !bucketName) {
    return fail(res, 503, 'VIDEO_UPLOAD_NOT_CONFIGURED', 'Firebase Admin Storage non è configurato sul server SONARA.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const kind = mediaKind(body.kind);
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const size = Math.max(0, Number(body.size || 0));
  const fileName = safeFileName(String(body.fileName || 'media'));

  if (!kind) return fail(res, 400, 'INVALID_MEDIA_KIND', 'Tipo di media non valido.');
  if (!validContentType(kind, contentType)) return fail(res, 400, 'INVALID_MEDIA_TYPE', 'Formato del file non valido per SONARA Video AI.');
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes(kind)) {
    return fail(res, 413, 'MEDIA_TOO_LARGE', 'Il file supera il limite consentito per SONARA Video AI.');
  }

  try {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `video-ai-inputs/${user.uid}/${Date.now()}-${randomPart}-${fileName}`;
    const bucket = getStorage(getAdminApp()).bucket(bucketName);
    const file = bucket.file(storagePath);
    const expiresWrite = Date.now() + 15 * 60 * 1000;
    const expiresRead = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresWrite,
      contentType
    });
    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresRead
    });

    return json(res, 200, {
      storagePath,
      uploadUrl,
      downloadUrl,
      contentType,
      size,
      kind,
      expiresAt: expiresWrite
    });
  } catch (cause) {
    console.error('[SONARA VIDEO UPLOAD] signed upload creation failed', cause);
    return fail(res, 502, 'VIDEO_UPLOAD_PREPARE_FAILED', cause instanceof Error ? cause.message : 'Preparazione upload fallita.');
  }
}
