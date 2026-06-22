import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { AppError } from './utils/errors';
import { logger } from './utils/logger';

import authRoutes from './routes/auth.routes';
import tripRoutes from './routes/trip.routes';

const app: Application = express();

// ─── Trust proxy (required for httpOnly cookies on Render/Vercel) ─────────────
app.set('trust proxy', 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// credentials: true is required for httpOnly cookies to flow cross-origin.
// FRONTEND_URL can be comma-separated for multiple allowed origins.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Root + health check ──────────────────────────────────────────────────────
// GET /        — Render health-check probes and keep-alive pings hit the root.
//               Without this they fall into the 404 handler and pollute logs.
// GET /health  — Explicit lightweight health endpoint for the Phase 8 cron.
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
});

// ─── Global error handler ─────────────────────────────────────────────────────
// Must have exactly 4 parameters to be recognized by Express as an error handler.
// Full technical detail (stack, original error) is always logged server-side.
// Only the pre-approved user-facing message is sent to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    // Operational errors: already classified with a user-safe message.
    // Log full detail at warn/error depending on severity.
    if (err.statusCode >= 500) {
      logger.error(`[${err.errorCode}] ${err.message}`, { stack: err.stack, path: req.path });
    } else {
      logger.warn(`[${err.errorCode}] ${err.message}`, { path: req.path });
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Truly unexpected error — log with full stack for post-mortem investigation.
  logger.error('Unhandled error:', { message: err.message, stack: err.stack, path: req.path });
  res.status(500).json({
    error: 'Something unexpected happened on our end. Please try again, and contact support if this continues.',
  });
});

export default app;
