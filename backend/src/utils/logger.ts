/**
 * Logger — thin wrapper around console that provides:
 *
 *   - Consistent log levels: info, warn, error, debug
 *   - In production (NODE_ENV=production), debug and info messages are
 *     suppressed to keep log volume manageable. Warnings and errors always
 *     fire regardless of environment — operational errors must never be silenced.
 *   - Structured prefix so log lines are easy to grep / filter in Render/Railway.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.info('[Trip] Created %s', tripId);
 *   logger.error('[Gemini] Auth failure', originalError);
 */

const isProd = process.env.NODE_ENV === 'production';

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  /**
   * Operational informational log — suppressed in production.
   * Use for routine flow steps: "Geocoding started", "Validation passed", etc.
   */
  info(message: string, ...args: unknown[]): void {
    if (!isProd) {
      console.info(`[${timestamp()}] INFO  ${message}`, ...args);
    }
  },

  /**
   * Warning — always logged regardless of environment.
   * Use for recoverable anomalies: retries, fallbacks, partial failures.
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${timestamp()}] WARN  ${message}`, ...args);
  },

  /**
   * Error — always logged regardless of environment.
   * Use for failures that reach the error handler, unexpected exceptions,
   * and any classified error that needs the real root cause preserved.
   */
  error(message: string, ...args: unknown[]): void {
    console.error(`[${timestamp()}] ERROR ${message}`, ...args);
  },

  /**
   * Debug — only emitted outside production.
   * Use for verbose operational detail that aids local development but
   * would be noise in production logs.
   */
  debug(message: string, ...args: unknown[]): void {
    if (!isProd) {
      console.debug(`[${timestamp()}] DEBUG ${message}`, ...args);
    }
  },
};
