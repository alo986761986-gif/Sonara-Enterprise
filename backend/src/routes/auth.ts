import { Router, Request, Response } from 'express';
import {
  createSonaraSession,
  getSonaraSession,
  destroySonaraSession,
  setSonaraSessionCookie,
  clearSonaraSessionCookie
} from '../auth/SonaraSessionAuth';

const router = Router();

router.get('/session', (req: Request, res: Response) => {
  const session = getSonaraSession(req);

  if (!session) {
    return res.status(401).json({
      authenticated: false
    });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      email: session.email
    }
  });
});

router.post('/login', (req: Request, res: Response) => {
  const expectedEmail =
    (process.env.SONARA_ADMIN_EMAIL || 'admin@sonara.ai')
      .trim()
      .toLowerCase();

  const expectedPassword =
    process.env.SONARA_ADMIN_PASSWORD || '';

  if (!expectedPassword) {
    return res.status(503).json({
      error: 'SONARA_ADMIN_PASSWORD is not configured.'
    });
  }

  const email =
    String(req.body?.email || '')
      .trim()
      .toLowerCase();

  const password =
    String(req.body?.password || '');

  if (
    email !== expectedEmail ||
    password !== expectedPassword
  ) {
    return res.status(401).json({
      error: 'Email or password incorrect.'
    });
  }

  const token = createSonaraSession(expectedEmail);

  setSonaraSessionCookie(res, token);

  return res.status(200).json({
    authenticated: true,
    user: {
      email: expectedEmail
    }
  });
});

router.post('/logout', (req: Request, res: Response) => {
  destroySonaraSession(req);
  clearSonaraSessionCookie(res);

  return res.status(200).json({
    authenticated: false
  });
});

export default router;
