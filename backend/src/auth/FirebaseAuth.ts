import { Request, Response, NextFunction } from 'express';
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
  user?: { uid: string; email?: string };
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

  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const options: AppOptions = {
    credential: serviceAccountJson
      ? cert(JSON.parse(serviceAccountJson))
      : applicationDefault(),
    ...(projectId ? { projectId } : {})
  };

  firebaseAdminApp = initializeApp(options);
  return firebaseAdminApp;
}

export async function verifyFirebaseIdToken(
  token: string
): Promise<DecodedIdToken> {
  if (!token) {
    throw new Error('Firebase ID token is missing.');
  }

  return getAuth(getFirebaseAdminApp()).verifyIdToken(token, true);
}

export function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  req.user = {
    uid: 'dev-user-001',
    email: 'admin@sonara.ai'
  };

  next();
}