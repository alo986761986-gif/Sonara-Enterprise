import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

interface SonaraSession {
  email: string;
  expiresAt: number;
}

const COOKIE_NAME = 'sonara_session';
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const sessions = new Map<string, SonaraSession>();

function parseCookies(raw: string = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

export function createSonaraSession(email: string): string {
  const token = crypto.randomBytes(32).toString('hex');

  sessions.set(token, {
    email,
    expiresAt: Date.now() + SESSION_DURATION_MS
  });

  return token;
}

export function getSonaraSession(req: Request): SonaraSession | null {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];

  if (!token) return null;

  const session = sessions.get(token);

  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export function destroySonaraSession(req: Request): void {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];

  if (token) {
    sessions.delete(token);
  }
}

export function setSonaraSessionCookie(
  res: Response,
  token: string
): void {
  const secure =
    process.env.SONARA_COOKIE_SECURE === 'true'
      ? '; Secure'
      : '';

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`
  );
}

export function clearSonaraSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
}

export function requireSonaraSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const session = getSonaraSession(req);

  if (!session) {
    return res.status(401).json      status: 'UNAUTHORIZED',
      error: 'Sonara authentication required.'
    });
  }

  next();
}
