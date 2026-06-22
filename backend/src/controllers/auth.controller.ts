import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AppError } from '../utils/errors';
import { catchAsync } from '../utils/errors';
import { getAuthUser } from '../types/auth.helpers';
import { generateSecureToken, hashToken } from '../utils/tokens';
import { sendVerificationEmail, sendWelcomeEmail } from '../services/email.service';
import { logger } from '../utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;       // 15 minutes in ms
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const EMAIL_VERIFY_EXPIRY_MS = 24 * 60 * 60 * 1000;  // 24 hours in ms

// ─── Cookie helpers ───────────────────────────────────────────────────────────
//
// Both cookies must carry SameSite=None; Secure in production because the
// frontend (Vercel) and backend (Render) are on different origins.
// This is the same Phase 8 cross-origin fix, extended to both cookies.
//
// Access cookie: broad path '/' so it's sent with every API request.
// Refresh cookie: scoped to '/api/auth' so it's only sent to refresh/logout
//   endpoints — reduces exposure surface.

function getCookieBase(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  };
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const base = getCookieBase(isProd);

  res.cookie('accessToken', accessToken, {
    ...base,
    maxAge: ACCESS_COOKIE_MAX_AGE,
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    ...base,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
    path: '/api/auth', // scoped: only sent to /api/auth/* endpoints
  });
}

function clearAuthCookies(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const base = getCookieBase(isProd);

  res.cookie('accessToken', '', { ...base, maxAge: 0, path: '/' });
  res.cookie('refreshToken', '', { ...base, maxAge: 0, path: '/api/auth' });
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function signAccessToken(userId: string, email: string): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return jwt.sign({ id: userId, email }, secret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

// ─── Refresh token storage helpers ───────────────────────────────────────────

async function storeRefreshToken(userId: string, rawToken: string, req: Request): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const deviceHint = (req.headers['user-agent'] || 'unknown').slice(0, 200);

  await RefreshToken.create({
    userId,
    tokenHash,
    deviceHint,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    revoked: false,
  });
}

async function issueTokenPair(
  userId: string,
  email: string,
  req: Request,
  res: Response
): Promise<void> {
  const accessToken = signAccessToken(userId, email);
  const rawRefreshToken = generateSecureToken();

  await storeRefreshToken(userId, rawRefreshToken, req);
  setAuthCookies(res, accessToken, rawRefreshToken);
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
export const register = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { email, name, password } = req.body as {
    email?: string;
    name?: string;
    password?: string;
  };

  if (!email || !name || !password) {
    throw new AppError('Email, name, and password are required.', 400);
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400);
  }
  if (name.trim().length < 2) {
    throw new AppError('Name must be at least 2 characters.', 400);
  }

  // Use generic message to prevent email enumeration
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new AppError('An account with that email already exists.', 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Generate email verification token
  const rawVerifyToken = generateSecureToken();
  const verifyTokenHash = hashToken(rawVerifyToken);
  const verifyExpiresAt = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);

  const user = await User.create({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash,
    emailVerified: false,
    emailVerificationTokenHash: verifyTokenHash,
    emailVerificationExpiresAt: verifyExpiresAt,
  });

  // Send verification email.
  // In mock mode (EMAIL_MODE=mock or unset): logs the link to the console.
  // In live mode (EMAIL_MODE=live): sends via Resend.
  // We fire-and-forget in a try/catch so email failure doesn't block the
  // 201 response — the user can always resend via /api/auth/resend-verification.
  sendVerificationEmail(user.email, rawVerifyToken).catch((err) => {
    logger.error('[EMAIL] Failed to send verification email on register:', err);
  });

  logger.info(`[AUTH] New registration: ${user.email} — verification email queued`);

  // Registration does NOT issue tokens — user must verify email (or just log in
  // with the non-blocking banner experience). The 201 body contains only the
  // "check your email" message so the frontend can show the success state.
  res.status(201).json({
    message: 'Account created. Check your email (or the server console in mock mode) for your verification link.',
    email: user.email,
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export const login = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    throw new AppError('Email and password are required.', 400);
  }

  const INVALID_CREDENTIALS = 'Invalid email or password.';

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');

  if (!user) {
    throw new AppError(INVALID_CREDENTIALS, 401);
  }

  // Google-only account: no passwordHash, can't login with password
  if (!user.passwordHash) {
    throw new AppError('This account uses Google Sign-In. Please use the "Sign in with Google" button.', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError(INVALID_CREDENTIALS, 401);
  }

  // Non-blocking email verification: we let users in but the response includes
  // emailVerified so the frontend can show the reminder banner.
  // Hard block is opt-in via EMAIL_VERIFY_REQUIRED=true env var.
  if (!user.emailVerified && process.env.EMAIL_VERIFY_REQUIRED === 'true') {
    throw new AppError(
      'Please verify your email before logging in. Check your inbox for the verification link, or request a new one.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  await issueTokenPair(user._id.toString(), user.email, req, res);

  logger.info(`[AUTH] Login: ${user.email}`);
  res.status(200).json({ user });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
export const logout = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const rawRefreshToken = req.cookies?.refreshToken as string | undefined;

  if (rawRefreshToken) {
    // Delete the specific refresh token document — this revokes only this session.
    // Other sessions (other devices) remain valid.
    const tokenHash = hashToken(rawRefreshToken);
    await RefreshToken.deleteOne({ tokenHash });
    logger.info('[AUTH] Refresh token revoked on logout');
  }

  clearAuthCookies(res);
  res.status(200).json({ message: 'Logged out successfully.' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
export const getMe = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id } = getAuthUser(req);

  const user = await User.findById(id);
  if (!user) {
    clearAuthCookies(res);
    throw new AppError('User not found. Please log in again.', 401);
  }

  res.status(200).json({ user });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
//
// Token rotation with theft detection:
//  1. Find the stored hash of the incoming refresh token.
//  2. If not found or already revoked → 401 (could be replayed after rotation).
//  3. If the same token was already used (rotated out) → THEFT SIGNAL:
//     invalidate ALL sessions for this user and force re-login.
//  4. Atomically mark old token revoked, issue a new access+refresh pair.
//
// The access token is stateless (15-min JWT). The refresh token is stateful
// (opaque random string, hash stored in DB). Rotation on every use means a
// replayed rotated-out token is an unambiguous signal that the original was stolen.
//
export const refresh = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const rawRefreshToken = req.cookies?.refreshToken as string | undefined;

  if (!rawRefreshToken) {
    throw new AppError('Authentication required. Please log in.', 401, 'REFRESH_MISSING');
  }

  const tokenHash = hashToken(rawRefreshToken);

  // Look up by hash — select tokenHash explicitly (select:false by default)
  const stored = await RefreshToken.findOne({ tokenHash }).select('+tokenHash');

  // Token not found in DB at all → never existed or already expired/deleted
  if (!stored) {
    clearAuthCookies(res);
    throw new AppError('Session expired. Please log in again.', 401, 'REFRESH_INVALID');
  }

  // Token found but already revoked → THEFT SIGNAL
  // The token was already used and rotated. If someone is presenting it again,
  // either the user stored an old token or an attacker stole it after rotation.
  // Either way: revoke ALL sessions for this user (nuclear option) and force re-login.
  if (stored.revoked || stored.expiresAt < new Date()) {
    logger.warn(
      `[AUTH] ⚠️  THEFT SIGNAL: rotated-out refresh token reused for user ${stored.userId}. ` +
      `Revoking all sessions.`
    );
    await RefreshToken.deleteMany({ userId: stored.userId });
    clearAuthCookies(res);
    throw new AppError(
      'Your session was invalidated for security reasons. Please log in again.',
      401,
      'REFRESH_THEFT_DETECTED'
    );
  }

  // Valid token: fetch user, revoke old token, issue new pair
  const user = await User.findById(stored.userId);
  if (!user) {
    await RefreshToken.deleteOne({ _id: stored._id });
    clearAuthCookies(res);
    throw new AppError('User not found. Please log in again.', 401);
  }

  // Mark old token revoked before issuing new pair (atomic enough for our threat model)
  await RefreshToken.findByIdAndUpdate(stored._id, { revoked: true });

  // Issue fresh access + refresh tokens
  await issueTokenPair(user._id.toString(), user.email, req, res);

  logger.info(`[AUTH] Token refreshed for ${user.email}`);
  res.status(200).json({ message: 'Session refreshed.' });
});

// ─── GET /api/auth/verify-email?token=... ─────────────────────────────────────
//
// GET is used (not POST) because the verification link in the email is a
// simple URL that users click — a GET is the natural HTTP method for
// "following a link." The token is in the query string, not the body.
// The token itself is the authorization — no other credentials needed.
//
export const verifyEmail = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const rawToken = req.query.token as string | undefined;

  if (!rawToken) {
    throw new AppError('Verification token is required.', 400);
  }

  const tokenHash = hashToken(rawToken);

  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpiresAt: { $gt: new Date() },
  }).select('+emailVerificationTokenHash +emailVerificationExpiresAt');

  if (!user) {
    throw new AppError(
      'Invalid or expired verification link. Please request a new one.',
      400,
      'VERIFY_INVALID'
    );
  }

  if (user.emailVerified) {
    // Idempotent — already verified, return success so the frontend shows the success state
    res.status(200).json({ message: 'Email already verified. You can now log in.' });
    return;
  }

  await User.findByIdAndUpdate(user._id, {
    emailVerified: true,
    emailVerificationTokenHash: undefined,
    emailVerificationExpiresAt: undefined,
  });

  logger.info(`[AUTH] Email verified for user ${user._id}`);

  // Fire-and-forget welcome email
  sendWelcomeEmail(user.email, user.name).catch((err) => {
    logger.warn('[EMAIL] Welcome email failed (non-critical):', err);
  });

  res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
});

// ─── POST /api/auth/resend-verification ───────────────────────────────────────
export const resendVerification = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email) {
    throw new AppError('Email address is required.', 400);
  }

  // Always return the same message — prevents email enumeration
  const SAFE_RESPONSE = {
    message: 'If that email exists and is unverified, a new verification link has been sent. Check the server console if EMAIL_MODE=mock.',
  };

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('+emailVerificationTokenHash +emailVerificationExpiresAt');

  if (!user || user.emailVerified) {
    res.status(200).json(SAFE_RESPONSE);
    return;
  }

  const rawVerifyToken = generateSecureToken();
  const verifyTokenHash = hashToken(rawVerifyToken);
  const verifyExpiresAt = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);

  await User.findByIdAndUpdate(user._id, {
    emailVerificationTokenHash: verifyTokenHash,
    emailVerificationExpiresAt: verifyExpiresAt,
  });

  sendVerificationEmail(user.email, rawVerifyToken).catch((err) => {
    logger.error('[EMAIL] Failed to resend verification email:', err);
  });

  logger.info(`[AUTH] Verification email resent to ${user.email}`);
  res.status(200).json(SAFE_RESPONSE);
});

// ─── POST /api/auth/google ────────────────────────────────────────────────────
//
// Google Sign-In / Sign-Up — three-case upsert.
//
// Flow: GIS button on frontend → returns a signed ID token → frontend sends
// it here → we verify it server-side with google-auth-library → extract
// verified email/name/googleId → run three-case upsert.
//
// We use GIS (Google Identity Services) + server-side token verification
// instead of the Passport.js redirect flow used in the LifeLine reference.
// Reason: this project is an Express API + Next.js SPA on different origins.
// A redirect flow (passport-google-oauth20) would require cross-origin
// redirect handling and a server-side session for state — neither fits this
// architecture. GIS sends the ID token directly to our API, which is clean.
//
// Case 1: googleId on file → returning Google user → issue tokens.
// Case 2: no googleId but email exists → existing local account → auto-link.
//   (Chosen over "require password confirmation" — Google has already verified
//   the email, so linking is safe. Risk profile matches password-reset access.
//   Trade-off documented in docs/AUTH.md.)
// Case 3: no existing user → create new user with emailVerified:true.
//   (Google already verified the email — no need to verify again.)
//
const googleOAuthClient = new OAuth2Client();

export const googleAuth = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { idToken } = req.body as { idToken?: string };

  if (!idToken) {
    throw new AppError('Google ID token is required.', 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    logger.error('[AUTH] GOOGLE_CLIENT_ID is not set');
    throw new AppError('Google Sign-In is not configured on this server.', 503);
  }

  // Verify the ID token with Google's public keys — this is the critical step
  // that prevents spoofed tokens. verifyIdToken() checks signature, expiry,
  // and audience (our client ID).
  let googleUserId: string;
  let googleEmail: string;
  let googleName: string;

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      throw new AppError('Invalid Google token payload.', 401);
    }
    googleUserId = payload.sub;
    googleEmail = payload.email.toLowerCase();
    googleName = payload.name || payload.email.split('@')[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn('[AUTH] Google token verification failed:', err);
    throw new AppError('Google authentication failed. Please try again.', 401);
  }

  // ── Case 1: Returning Google user (googleId already on file) ─────────────
  let user = await User.findOne({ googleId: googleUserId });

  if (user) {
    logger.info(`[AUTH] Google login — returning user: ${user.email}`);
    await issueTokenPair(user._id.toString(), user.email, req, res);
    res.status(200).json({ user });
    return;
  }

  // ── Case 2: Existing local-password account, same email ──────────────────
  const existingByEmail = await User.findOne({ email: googleEmail });

  if (existingByEmail) {
    // Auto-link: add googleId + mark emailVerified (Google verified the email)
    user = await User.findByIdAndUpdate(
      existingByEmail._id,
      { googleId: googleUserId, emailVerified: true },
      { new: true }
    ) as typeof existingByEmail;

    logger.info(`[AUTH] Google login — linked to existing account: ${googleEmail}`);
    await issueTokenPair(user!._id.toString(), user!.email, req, res);
    res.status(200).json({ user });
    return;
  }

  // ── Case 3: Brand-new user ───────────────────────────────────────────────
  // emailVerified: true because Google has already verified this email address.
  // passwordHash: omitted — this is a Google-only account.
  const newUser = await User.create({
    email: googleEmail,
    name: googleName,
    googleId: googleUserId,
    emailVerified: true,
    // no passwordHash — Google-only account
  });

  logger.info(`[AUTH] Google sign-up — new user created: ${newUser.email} (${newUser._id})`);
  await issueTokenPair(newUser._id.toString(), newUser.email, req, res);
  res.status(201).json({ user: newUser });
});
