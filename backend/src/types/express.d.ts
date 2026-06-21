import { Request } from 'express';

// Extend Express Request to carry the authenticated user payload
// This is populated by the requireAuth middleware after JWT verification
export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * getAuthUser — narrow req.user inside protected routes.
 * Throws a programming error (not an AppError) if called outside
 * of a requireAuth-protected route, making the mistake obvious at dev time.
 */
export function getAuthUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new Error(
      'getAuthUser called outside of authenticated route — this is a programming error'
    );
  }
  return req.user;
}
