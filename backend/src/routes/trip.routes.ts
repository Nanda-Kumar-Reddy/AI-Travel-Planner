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
  refreshBudget,
  refreshHotels,
  refreshRisk,
} from '../controllers/trip.controller';

const router = Router();

router.use(requireAuth);

// ── Phase 3 ──────────────────────────────────────────────────────────────────
router.post('/', createTrip);
router.get('/', getTrips);
router.get('/:id', getTripById);
router.delete('/:id', deleteTrip);

// ── Phase 4 ──────────────────────────────────────────────────────────────────
router.post('/:id/days/:dayNumber/activities', addActivity);
router.delete('/:id/days/:dayNumber/activities/:activityId', removeActivity);
router.post('/:id/days/:dayNumber/regenerate', regenerateDay);

// ── Phase 5 ──────────────────────────────────────────────────────────────────
router.post('/:id/budget/refresh', refreshBudget);
router.post('/:id/hotels', refreshHotels);

// ── Phase 6 — Risk engine ────────────────────────────────────────────────────
router.post('/:id/risk', refreshRisk);

export default router;
