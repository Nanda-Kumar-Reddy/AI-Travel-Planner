import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface JwtPayload {
  id: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * requireAuth — JWT auth middleware using httpOnly accessToken cookie.
 *
 * Phase 11 change: reads req.cookies.accessToken (was req.cookies.token).
 * The access token is now short-lived (15 min). When it expires, the frontend
 * intercepts the 401, silently POSTs to /api/auth/refresh to rotate the
 * refresh token and get a new access token, then retries the original request.
 * If the refresh also fails, the user is redirected to /login.
 *
 * Returns 401 uniformly on any failure — the client only needs to know
 * "you need to log in / refresh," not the specific failure reason.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.accessToken as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    logger.error('FATAL: JWT_ACCESS_SECRET environment variable is not set');
    res.status(500).json({ error: 'Server configuration error.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    // TokenExpiredError → frontend will catch 401 and attempt silent refresh
    // JsonWebTokenError → invalid signature (tampered cookie)
    // Both treated identically to the client
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
};
