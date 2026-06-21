import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createTrip,
  getTrips,
  getTripById,
  deleteTrip,
} from '../controllers/trip.controller';

const router = Router();

// All trip routes protected — requireAuth at router level
// so every route added here is automatically behind the auth gate
router.use(requireAuth);

// POST   /api/trips         — create + generate (synchronous)
router.post('/', createTrip);

// GET    /api/trips         — list all trips for authenticated user (summary)
router.get('/', getTrips);

// GET    /api/trips/:id     — full trip detail (itinerary, hotels, budget, risk)
router.get('/:id', getTripById);

// DELETE /api/trips/:id     — delete trip (scoped to owner)
router.delete('/:id', deleteTrip);

// Phase 5: POST /:id/days/:dayNumber/activities
// Phase 5: DELETE /:id/days/:dayNumber/activities/:activityId
// Phase 5: POST /:id/days/:dayNumber/regenerate
// Phase 6: POST /:id/budget/refresh
// Phase 7: POST /:id/hotels
// Phase 8: POST /:id/risk

export default router;
