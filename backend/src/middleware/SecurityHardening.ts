import { Request, Response, NextFunction } from 'express';

export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  next();
}

export function sanitizeInput(input: any) {
  if (typeof input === 'string') return input.trim();
  return input;
}
