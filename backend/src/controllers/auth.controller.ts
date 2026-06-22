import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { AppError } from '../utils/errors';
import { catchAsync } from '../utils/errors';
import { getAuthUser } from '../types/auth.helpers';

// ─── Cookie configuration ─────────────────────────────────────────────────────
const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function setAuthCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                        // XSS protection — JS cannot read it
    secure: isProd,                        // HTTPS only in production
    sameSite: isProd ? 'none' : 'lax',    // 'none' required for cross-origin (Vercel ↔ Render)
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 0,
    path: '/',
  });
}

function signToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ id: userId, email }, secret, { expiresIn: '7d' });
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
export const register = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { email, name, password } = req.body as {
    email?: string;
    name?: string;
    password?: string;
  };

  // Input validation
  if (!email || !name || !password) {
    throw new AppError('Email, name, and password are required.', 400);
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400);
  }
  if (name.trim().length < 2) {
    throw new AppError('Name must be at least 2 characters.', 400);
  }

  // Check for existing account — use a generic message to avoid enumeration
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new AppError('An account with that email already exists.', 400);
  }

  // Hash password — 12 rounds: strong enough for 2024, fast enough for UX
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const user = await User.create({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash,
  });

  // Sign JWT and set httpOnly cookie
  const token = signToken(user._id.toString(), user.email);
  setAuthCookie(res, token);

  // Return user object — passwordHash is excluded by the model's toJSON transform
  res.status(201).json({ user });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export const login = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    throw new AppError('Email and password are required.', 400);
  }

  // Fetch user including passwordHash (select:false by default)
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');

  // Deliberate: same error message whether user not found OR password wrong
  // This prevents user enumeration attacks
  const INVALID_CREDENTIALS = 'Invalid email or password.';

  if (!user) {
    throw new AppError(INVALID_CREDENTIALS, 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError(INVALID_CREDENTIALS, 401);
  }

  const token = signToken(user._id.toString(), user.email);
  setAuthCookie(res, token);

  res.status(200).json({ user });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
export const logout = catchAsync(async (_req: Request, res: Response): Promise<void> => {
  clearAuthCookie(res);
  res.status(200).json({ message: 'Logged out successfully.' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Protected by requireAuth middleware — req.user is guaranteed to exist here
export const getMe = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id } = getAuthUser(req);

  const user = await User.findById(id);
  if (!user) {
    // Token valid but user deleted — clear the stale cookie
    clearAuthCookie(res);
    throw new AppError('User not found. Please log in again.', 401);
  }

  res.status(200).json({ user });
});
