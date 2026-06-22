import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  refresh,
  verifyEmail,
  resendVerification,
  googleAuth,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ── Public routes ─────────────────────────────────────────────────────────────

// POST /api/auth/register — create account (unverified), send verification email
router.post('/register', register);

// POST /api/auth/login — verify credentials, issue access+refresh token pair
router.post('/login', login);

// POST /api/auth/logout — revoke specific refresh token, clear both cookies
router.post('/logout', logout);

// POST /api/auth/refresh — validate refresh token, rotate to new pair
// Path-scoped cookie: the refreshToken cookie is only sent to /api/auth/*
router.post('/refresh', refresh);

// GET /api/auth/verify-email?token=... — hash token, match, mark emailVerified
// GET chosen over POST because verification links in emails are clicked as URLs
router.get('/verify-email', verifyEmail);

// POST /api/auth/resend-verification — regenerate + resend verification token
router.post('/resend-verification', resendVerification);

// POST /api/auth/google — verify GIS ID token, three-case upsert, issue token pair
router.post('/google', googleAuth);

// ── Protected routes ──────────────────────────────────────────────────────────

// GET /api/auth/me — validate session, return current user
router.get('/me', requireAuth, getMe);

export default router;
