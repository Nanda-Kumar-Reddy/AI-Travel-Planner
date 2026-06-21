/**
 * AppError — a structured error class for all expected application errors.
 * Thrown in service/controller layers; caught and serialized by the central
 * error handler middleware in app.ts.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes expected errors from unexpected crashes
    Error.captureStackTrace(this, this.constructor);
  }
}

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
