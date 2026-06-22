/**
 * tokens.ts — cryptographic token utilities shared across auth flows.
 *
 * These two functions are the building block for:
 *  - Refresh tokens (random opaque value → hash stored in DB)
 *  - Email verification tokens (same pattern)
 *
 * We never store raw token values in the database — only their SHA-256 hash.
 * The raw token travels in the cookie / email link; the hash goes to MongoDB.
 * If the DB is compromised, stored hashes cannot be used directly.
 */
import crypto from 'crypto';

/**
 * generateSecureToken — produces a 64-char hex string (256 bits of entropy).
 * Used as the raw value sent to the client (cookie or email link).
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * hashToken — SHA-256 hex digest of a raw token string.
 * Used to produce the value stored in MongoDB.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
