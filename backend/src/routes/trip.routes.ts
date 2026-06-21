import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createTrip,
  getTrips,
  getTripById,
  deleteTrip,
  addActivity,
  removeActivity,
  regenerateDay,
} from '../controllers/trip.controller';

const router = Router();

// All trip routes protected — requireAuth at router level
router.use(requireAuth);

// ── Phase 3 ──────────────────────────────────────────────────────────────────
// POST   /api/trips              — create + generate (synchronous, awaits Gemini)
router.post('/', createTrip);

// GET    /api/trips              — list user's trips (summary fields)
router.get('/', getTrips);

// GET    /api/trips/:id          — full trip detail
router.get('/:id', getTripById);

// DELETE /api/trips/:id          — delete (scoped to owner)
router.delete('/:id', deleteTrip);

// ── Phase 4 ──────────────────────────────────────────────────────────────────
// POST   /api/trips/:id/days/:dayNumber/activities          — add activity
router.post('/:id/days/:dayNumber/activities', addActivity);

// DELETE /api/trips/:id/days/:dayNumber/activities/:activityId — remove activity
router.delete('/:id/days/:dayNumber/activities/:activityId', removeActivity);

// POST   /api/trips/:id/days/:dayNumber/regenerate           — regenerate day via Gemini
router.post('/:id/days/:dayNumber/regenerate', regenerateDay);

// ── Phase 6 (budget refresh) ─────────────────────────────────────────────────
// router.post('/:id/budget/refresh', refreshBudget);

// ── Phase 7 (hotel alternatives) ─────────────────────────────────────────────
// router.post('/:id/hotels', regenerateHotels);

// ── Phase 8 (risk engine) ────────────────────────────────────────────────────
// router.post('/:id/risk', runRiskPass);

export default router;
