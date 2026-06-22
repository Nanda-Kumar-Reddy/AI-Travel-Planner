import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Trip } from '../models/Trip';
import { AppError, catchAsync, databaseError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getAuthUser } from '../types/auth.helpers';
import { geocodeDestination } from '../services/geocoding.service';
import {
  generateItinerary,
  regenerateDayActivities,
  generateBudgetEstimate,
  generateHotelSuggestions,
} from '../services/gemini.service';
import { runRiskPass } from '../services/risk.service';
import type { DayDiff, ActivityShape } from '../types/trip.types';

// ─── Risk-pass helper ─────────────────────────────────────────────────────────
// Typed with `any` to sidestep Mongoose's opaque HydratedDocument generic,
// which causes save() return-type conflicts with any manually defined interface.
// The suppression is isolated to this one helper function.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyRiskPass(trip: any): Promise<void> {
  try {
    const result = await runRiskPass({
      destination: String(trip.destination),
      durationDays: Number(trip.durationDays),
      budgetTier: trip.budgetTier as 'Low' | 'Medium' | 'High',
      startDate: trip.startDate as Date | null | undefined,
      destinationLat: trip.destinationLat as number | null | undefined,
      destinationLng: trip.destinationLng as number | null | undefined,
      itinerary: (trip.itinerary as Array<{
        dayNumber: number;
        activities: Array<{ title: string; estimatedCostUSD: number; lat?: number; lng?: number }>;
      }>).map((d) => ({
        dayNumber: d.dayNumber,
        activities: d.activities.map((a) => ({
          title: a.title,
          estimatedCostUSD: a.estimatedCostUSD,
          lat: a.lat,
          lng: a.lng,
        })),
      })),
      estimatedBudget: trip.estimatedBudget as {
        transport: number; accommodation: number; food: number; activities: number; total: number;
      } | null | undefined,
    } satisfies import('../services/risk.service').TripInput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trip.riskFlags = result.riskFlags as any;
    trip.confidenceScore = result.confidenceScore;
    await trip.save();
  } catch (err) {
    // Risk pass is non-fatal — the trip is already saved; we log and move on
    // so a weather API outage doesn't block the user from seeing their itinerary.
    logger.error('[Risk] applyRiskPass failed (non-fatal):', String(err));
  }
}


// ─── POST /api/trips ──────────────────────────────────────────────────────────
export const createTrip = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);

  const { destination, durationDays, budgetTier, interests, startDate } = req.body as {
    destination?: string; durationDays?: number; budgetTier?: string;
    interests?: string[]; startDate?: string|null;
  };

  if (!destination?.trim()) throw new AppError('Destination is required.', 400);
  if (!durationDays || durationDays < 1 || durationDays > 30)
    throw new AppError('Duration must be between 1 and 30 days.', 400);
  if (!['Low', 'Medium', 'High'].includes(budgetTier ?? ''))
    throw new AppError('Budget tier must be Low, Medium, or High.', 400);
  if (!Array.isArray(interests) || interests.length === 0)
    throw new AppError('At least one interest is required.', 400);

  const safeInterests = interests.map((i) => String(i).trim()).filter(Boolean).slice(0, 10);

  logger.info(`[Trip] Geocoding "${destination}"...`);
  const geo = await geocodeDestination(destination);
  if (geo) logger.info(`[Trip] Geocoded → (${geo.lat}, ${geo.lng}) ${geo.resolvedName}`);
  else logger.warn(`[Trip] Geocoding failed for "${destination}" — coordinates will be null`);

  logger.info(`[Trip] Generating itinerary for "${destination}" (${durationDays}d, ${budgetTier})`);
  const generated = await generateItinerary({
    destination: geo?.resolvedName ?? destination,
    durationDays: Number(durationDays),
    budgetTier: budgetTier as 'Low' | 'Medium' | 'High',
    interests: safeInterests,
    startDate: startDate ?? null,
  });

  let created;
  try {
    created = await Trip.create({
      userId: new mongoose.Types.ObjectId(userId),
      destination: destination.trim(),
      startDate: startDate ? new Date(startDate) : null,
      durationDays: Number(durationDays),
      budgetTier,
      interests: safeInterests,
      destinationLat: geo?.lat,
      destinationLng: geo?.lng,
      itinerary: generated.itinerary,
      hotels: generated.hotels,
      estimatedBudget: generated.estimatedBudget,
      confidenceScore: 100,
      riskFlags: [],
      status: 'ready',
    });
  } catch (err) {
    logger.error('[Trip] Database write failed during createTrip:', err);
    throw databaseError();
  }

  const loaded = await Trip.findById(created._id);
  if (!loaded) throw new AppError('Failed to load created trip.', 500);
  await applyRiskPass(loaded);

  logger.info(`[Trip] Created ${loaded._id} — score ${loaded.confidenceScore}`);
  res.status(201).json({ trip: loaded });
});

// ─── GET /api/trips ───────────────────────────────────────────────────────────
export const getTrips = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const trips = await Trip.find({ userId })
    .select('destination durationDays budgetTier confidenceScore riskFlags status startDate estimatedBudget createdAt updatedAt')
    .sort({ createdAt: -1 });
  res.status(200).json({ trips });
});

// ─── GET /api/trips/:id ───────────────────────────────────────────────────────
export const getTripById = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const trip = await Trip.findOne({ _id: req.params.id, userId });
  if (!trip) throw new AppError('Trip not found.', 404);
  res.status(200).json({ trip });
});

// ─── DELETE /api/trips/:id ────────────────────────────────────────────────────
export const deleteTrip = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const trip = await Trip.findOneAndDelete({ _id: req.params.id, userId });
  if (!trip) throw new AppError('Trip not found.', 404);
  res.status(200).json({ message: 'Trip deleted successfully.' });
});

// ─── POST /api/trips/:id/days/:dayNumber/activities ───────────────────────────
export const addActivity = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId, dayNumber: dayNumberStr } = req.params;
  const dayNumber = parseInt(dayNumberStr, 10);
  if (isNaN(dayNumber)) throw new AppError('Invalid day number.', 400);

  const { title, description, estimatedCostUSD, timeOfDay, lat, lng } = req.body as {
    title?: string; description?: string; estimatedCostUSD?: number;
    timeOfDay?: string; lat?: number; lng?: number;
  };

  if (!title?.trim()) throw new AppError('Activity title is required.', 400);
  if (!['Morning', 'Afternoon', 'Evening'].includes(timeOfDay ?? ''))
    throw new AppError('timeOfDay must be Morning, Afternoon, or Evening.', 400);

  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const day = trip.itinerary.find((d) => d.dayNumber === dayNumber);
  if (!day) throw new AppError(`Day ${dayNumber} not found on this trip.`, 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (day.activities as unknown as any[]).push({
    title: title.trim(),
    description: description?.trim() ?? '',
    estimatedCostUSD: Number(estimatedCostUSD) || 0,
    timeOfDay,
    ...(lat !== undefined && { lat: Number(lat) }),
    ...(lng !== undefined && { lng: Number(lng) }),
  });

  try {
    await trip.save();
  } catch (err) {
    logger.error('[Trip] Database write failed during addActivity:', err);
    throw databaseError();
  }
  await applyRiskPass(trip);
  logger.info(`[Trip] Added activity to day ${dayNumber} — score now ${trip.confidenceScore}`);
  res.status(201).json({ trip });
});

// ─── DELETE /api/trips/:id/days/:dayNumber/activities/:activityId ─────────────
export const removeActivity = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId, dayNumber: dayNumberStr, activityId } = req.params;
  const dayNumber = parseInt(dayNumberStr, 10);
  if (isNaN(dayNumber)) throw new AppError('Invalid day number.', 400);

  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const day = trip.itinerary.find((d) => d.dayNumber === dayNumber);
  if (!day) throw new AppError(`Day ${dayNumber} not found on this trip.`, 404);

  const idx = day.activities.findIndex((a) => a._id.toString() === activityId);
  if (idx === -1) throw new AppError('Activity not found.', 404);

  day.activities.splice(idx, 1);
  try {
    await trip.save();
  } catch (err) {
    logger.error('[Trip] Database write failed during removeActivity:', err);
    throw databaseError();
  }
  await applyRiskPass(trip);
  logger.info(`[Trip] Removed activity ${activityId} — score now ${trip.confidenceScore}`);
  res.status(200).json({ trip });
});

// ─── POST /api/trips/:id/days/:dayNumber/regenerate ───────────────────────────
export const regenerateDay = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId, dayNumber: dayNumberStr } = req.params;
  const dayNumber = parseInt(dayNumberStr, 10);
  if (isNaN(dayNumber)) throw new AppError('Invalid day number.', 400);

  const { userFeedback, riskContext } = req.body as { userFeedback?: string; riskContext?: string };

  if (!userFeedback?.trim() && !riskContext?.trim())
    throw new AppError('At least userFeedback or riskContext is required.', 400);

  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const day = trip.itinerary.find((d) => d.dayNumber === dayNumber);
  if (!day) throw new AppError(`Day ${dayNumber} not found on this trip.`, 404);

  const before: DayDiff['before'] = day.activities.map((a) => ({
    _id: a._id.toString(), title: a.title, description: a.description,
    estimatedCostUSD: a.estimatedCostUSD, timeOfDay: a.timeOfDay, lat: a.lat, lng: a.lng,
  }));

  const newActivities = await regenerateDayActivities({
    destination: trip.destination,
    durationDays: trip.durationDays,
    budgetTier: trip.budgetTier,
    interests: trip.interests,
    fullItinerary: trip.itinerary.map((d) => ({
      dayNumber: d.dayNumber,
      activities: d.activities.map((a) => ({ title: a.title, timeOfDay: a.timeOfDay })),
    })),
    dayNumber,
    userFeedback: userFeedback?.trim(),
    riskContext: riskContext?.trim(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  day.activities = newActivities as any;
  try {
    await trip.save();
  } catch (err) {
    logger.error('[Trip] Database write failed during regenerateDay:', err);
    throw databaseError();
  }

  const reloaded = await Trip.findById(trip._id);
  if (!reloaded) throw new AppError('Trip reload failed after regeneration.', 500);

  const updatedDay = reloaded.itinerary.find((d) => d.dayNumber === dayNumber)!;
  const after: DayDiff['after'] = updatedDay.activities.map((a) => ({
    _id: a._id.toString(), title: a.title, description: a.description,
    estimatedCostUSD: a.estimatedCostUSD, timeOfDay: a.timeOfDay, lat: a.lat, lng: a.lng,
  }));
  const changedActivityIds = (after as Array<ActivityShape & { _id: string }>).map((a) => a._id);
  const diff: DayDiff = { dayNumber, before, after, changedActivityIds };

  await applyRiskPass(reloaded);
  logger.info(`[Trip] Regenerated day ${dayNumber} — score now ${reloaded.confidenceScore}`);
  res.status(200).json({ trip: reloaded, diff });
});

// ─── POST /api/trips/:id/budget/refresh ───────────────────────────────────────
export const refreshBudget = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const trip = await Trip.findOne({ _id: req.params.id, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const activitiesTotalCost = trip.itinerary.reduce(
    (ds, d) => ds + d.activities.reduce((as, a) => as + a.estimatedCostUSD, 0), 0
  );

  const estimatedBudget = await generateBudgetEstimate({
    destination: trip.destination, durationDays: trip.durationDays,
    budgetTier: trip.budgetTier, interests: trip.interests, activitiesTotalCost,
  });

  trip.estimatedBudget = estimatedBudget;
  try {
    await trip.save();
  } catch (err) {
    logger.error('[Trip] Database write failed during refreshBudget:', err);
    throw databaseError();
  }
  logger.info(`[Trip] Budget refreshed — total $${estimatedBudget.total}`);
  res.status(200).json({ estimatedBudget });
});

// ─── POST /api/trips/:id/hotels ───────────────────────────────────────────────
export const refreshHotels = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const trip = await Trip.findOne({ _id: req.params.id, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const hotels = await generateHotelSuggestions({
    destination: trip.destination, durationDays: trip.durationDays, budgetTier: trip.budgetTier,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trip.hotels = hotels as any;
  try {
    await trip.save();
  } catch (err) {
    logger.error('[Trip] Database write failed during refreshHotels:', err);
    throw databaseError();
  }
  logger.info(`[Trip] Hotels refreshed — ${hotels.length} suggestions`);
  res.status(200).json({ hotels });
});

// ─── POST /api/trips/:id/risk ─────────────────────────────────────────────────
export const refreshRisk = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const trip = await Trip.findOne({ _id: req.params.id, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  await applyRiskPass(trip);
  logger.info(`[Trip] Manual risk refresh — score ${trip.confidenceScore}`);
  res.status(200).json({ confidenceScore: trip.confidenceScore, riskFlags: trip.riskFlags });
});
