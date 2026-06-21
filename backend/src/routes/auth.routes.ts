import { Router } from 'express';
import { register, login, logout, getMe } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /api/auth/register — create account, set httpOnly cookie
router.post('/register', register);

// POST /api/auth/login — verify credentials, set httpOnly cookie
router.post('/login', login);

// POST /api/auth/logout — clear cookie
router.post('/logout', logout);

// GET /api/auth/me — validate session, return current user (protected)
router.get('/me', requireAuth, getMe);

export default router;
