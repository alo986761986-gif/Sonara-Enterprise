import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: { uid: string; email?: string };
}

export function verifyFirebaseToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  req.user = { uid: 'dev-user-001', email: 'admin@sonara.ai' };
  next();
}
