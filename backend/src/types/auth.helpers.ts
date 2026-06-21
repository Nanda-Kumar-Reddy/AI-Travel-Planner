import { Request } from 'express';
import { AuthenticatedUser } from './express.d';

/**
 * getAuthUser — narrow req.user to AuthenticatedUser inside protected routes.
 * Call this instead of `req.user!` to get a clear error if the middleware
 * is ever accidentally skipped.
 */
export function getAuthUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new Error(
      'getAuthUser called outside of authenticated route — this is a programming error'
    );
  }
  return req.user;
}
