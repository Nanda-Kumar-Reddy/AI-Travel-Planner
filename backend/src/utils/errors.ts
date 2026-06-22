/**
 * AppError — structured error class for all expected application errors.
 *
 * Every error type below carries a pre-approved user-facing message and an
 * HTTP status code. Service layers throw the most specific subclass they can;
 * the central error handler in app.ts serializes only the message to the client
 * while logging full technical detail server-side.
 *
 * Taxonomy (8 types):
 *   AI_RATE_LIMITED       — Gemini 429, all retries exhausted
 *   AI_UNREACHABLE        — Network/timeout reaching AI service
 *   AI_INVALID_OUTPUT     — Zod validation failed after retry
 *   AI_AUTH_ERROR         — Invalid/expired API key (never exposed to client)
 *   DATABASE_ERROR        — MongoDB connection or write failure
 *   NOT_FOUND             — Resource missing or not owned by user
 *   VALIDATION_ERROR      — Bad request body (field-level messages OK)
 *   UNKNOWN               — True unknown/unhandled fallback (should be rare)
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number, errorCode = 'UNKNOWN') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes expected errors from unexpected crashes
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Classified error factory functions ───────────────────────────────────────
// Each function returns the AppError with the correct user-facing message and
// status code. Services call these instead of throwing raw AppError instances.

/**
 * AI provider returned HTTP 429 and all retries were exhausted.
 * User sees a demand-related message; no mention of specific provider.
 */
export function aiRateLimitedError(): AppError {
  return new AppError(
    'Our AI provider is currently experiencing high demand. Please try again in a minute.',
    503,
    'AI_RATE_LIMITED'
  );
}

/**
 * Network timeout or connection failure reaching the AI service.
 */
export function aiUnreachableError(): AppError {
  return new AppError(
    'We couldn\'t reach the AI service. Please check your connection and try again.',
    502,
    'AI_UNREACHABLE'
  );
}

/**
 * AI returned output that failed Zod schema validation even after a retry.
 * Tells the user to retry; does not expose schema/validation details.
 */
export function aiInvalidOutputError(): AppError {
  return new AppError(
    'We had trouble generating a valid itinerary this time. Please try again — this usually works on a second attempt.',
    502,
    'AI_INVALID_OUTPUT'
  );
}

/**
 * Invalid or expired Gemini API key.
 * The real cause is logged server-side; user gets a generic availability message
 * so we never hint that the problem is a credentials issue.
 */
export function aiAuthError(): AppError {
  return new AppError(
    'AI itinerary generation is temporarily unavailable. Please try again shortly.',
    503,
    'AI_AUTH_ERROR'
  );
}

/**
 * MongoDB connection or write failure.
 */
export function databaseError(): AppError {
  return new AppError(
    'We couldn\'t save your trip right now. Please try again.',
    503,
    'DATABASE_ERROR'
  );
}

/**
 * Resource not found or does not belong to the authenticated user.
 * Single message avoids enumeration: attacker can't distinguish "wrong user"
 * from "doesn't exist."
 */
export function notFoundError(resourceName = 'Trip'): AppError {
  return new AppError(`${resourceName} not found.`, 404, 'NOT_FOUND');
}

/**
 * Bad request body — field-level messages are fine here since they come
 * from our own validation logic, not from internal systems.
 */
export function validationError(message: string): AppError {
  return new AppError(message, 400, 'VALIDATION_ERROR');
}

/**
 * True fallback for genuinely unclassified errors.
 * This should almost never appear; if it does frequently, investigate and add a
 * specific type above.
 */
export function unknownError(): AppError {
  return new AppError(
    'Something unexpected happened on our end. Please try again, and contact support if this continues.',
    500,
    'UNKNOWN'
  );
}

// ─── catchAsync helper ────────────────────────────────────────────────────────

/**
 * catchAsync — wraps an async route handler so that any thrown error
 * (including rejected promises) is forwarded to Express's next() error handler
 * rather than causing an unhandled rejection crash.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const catchAsync = (fn: AsyncHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};
