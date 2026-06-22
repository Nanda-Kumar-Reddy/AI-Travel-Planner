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

// ── Trip CRUD ─────────────────────────────────────────────────────────────────
router.post('/', createTrip);
router.get('/', getTrips);
router.get('/:id', getTripById);
router.delete('/:id', deleteTrip);

// ── Day operations ────────────────────────────────────────────────────────────
router.post('/:id/days/:dayNumber/activities', addActivity);
router.delete('/:id/days/:dayNumber/activities/:activityId', removeActivity);
router.post('/:id/days/:dayNumber/regenerate', regenerateDay);

// ── Trip-level refresh operations ─────────────────────────────────────────────
router.post('/:id/budget/refresh', refreshBudget);
router.post('/:id/hotels', refreshHotels);
router.post('/:id/risk', refreshRisk);

export default router;
