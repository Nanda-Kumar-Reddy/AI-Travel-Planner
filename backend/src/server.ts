import 'dotenv/config';
import app from './app';
import connectDB from './config/db';
import { logger } from './utils/logger';

// ─── Startup env validation ───────────────────────────────────────────────────
//
// Called before the server starts listening. Crashes immediately with a clear
// list of missing vars rather than letting a mid-request failure surface them
// as a confusing stack trace minutes into a deploy.
//
// Required always:
//   MONGO_URI         — MongoDB Atlas connection string
//   JWT_ACCESS_SECRET — signs every access token (added Phase 11; was JWT_SECRET)
//   GEMINI_API_KEY    — Gemini AI service
//   FRONTEND_URL      — CORS allowlist + email verification links
//
// Required when EMAIL_MODE=live:
//   SMTP_USER         — Gmail address used as SMTP sender
//   SMTP_PASS         — Gmail App Password for SMTP auth
//
function validateEnv(): void {
  const required: string[] = [
    'MONGO_URI',
    'JWT_ACCESS_SECRET',
    'GEMINI_API_KEY',
    'FRONTEND_URL',
  ];

  // Conditional: Resend API key only required in live email mode
  if (process.env.EMAIL_MODE === 'live') {
    required.push('RESEND_KEY');
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    // Use process.stderr directly — logger may not be initialised yet
    process.stderr.write(
      `\n[FATAL] Missing required environment variables: ${missing.join(', ')}\n` +
      `Server cannot start. Add these to your Render dashboard (or .env for local dev).\n\n`
    );
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || '5000', 10);

const startServer = async (): Promise<void> => {
  // Validate env vars before anything else — fail fast, fail loud
  validateEnv();

  await connectDB();

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
};

startServer().catch((err) => {
  logger.error('Fatal: server failed to start', err);
  process.exit(1);
});
