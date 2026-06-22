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
 * requireAuth — JWT auth middleware using httpOnly cookie transport.
 *
 * Reads req.cookies.token (set by login/register, httpOnly so JS can't read it).
 * Verifies with JWT_SECRET, attaches decoded payload to req.user.
 * Returns 401 on missing token or any verification failure.
 *
 * Note: We return 401 (not 403) uniformly — the client only needs to know
 * "you need to log in," not the reason for rejection.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // JWT_SECRET missing: programming error that must never reach production.
    // Log at error level so ops can catch it immediately in startup logs.
    logger.error('FATAL: JWT_SECRET environment variable is not set');
    res.status(500).json({ error: 'Server configuration error.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    // Covers: JsonWebTokenError (invalid signature), TokenExpiredError, NotBeforeError
    res.status(401).json({ error: 'Session invalid or expired. Please log in again.' });
  }
};
