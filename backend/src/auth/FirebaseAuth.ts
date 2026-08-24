import { NextFunction, Request, Response } from 'express';
import {
  App,
  AppOptions,
  applicationDefault,
  cert,
  getApps,
  initializeApp
} from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
    provider?: string;
  };
}

let firebaseAdminApp: App | null = null;

function getFirebaseAdminApp(): App {
  if (firebaseAdminApp) return firebaseAdminApp;

  const existingApp = getApps()[0];
  if (existingApp) {
    firebaseAdminApp = existingApp;
    return existingApp;
  }

  const projectId =
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const options: AppOptions = {
    credential: serviceAccountJson
      ? cert(JSON.parse(serviceAccountJson))
      : applicationDefault(),
    ...(projectId ? { projectId } : {})
  };

  firebaseAdminApp = initializeApp(options);
  return firebaseAdminApp;
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  if (!token) throw new Error('Firebase ID token is missing.');
  return getAuth(getFirebaseAdminApp()).verifyIdToken(token, true);
}

function extractBearerToken(req: Request): string {
  const authorization = String(req.headers.authorization || '');
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

export async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      status: 'error',
      code: 'AUTH_TOKEN_MISSING',
      error: 'A Firebase bearer token is required.'
    });
  }

  try {
    const decoded = await verifyFirebaseIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      provider: decoded.firebase?.sign_in_provider
    };
    return next();
  } catch (error) {
    console.error('[AUTH] Firebase token verification failed.');
    return res.status(401).json({
      status: 'error',
      code: 'AUTH_TOKEN_INVALID',
      error: 'The authentication token is invalid or expired.'
    });
  }
}
