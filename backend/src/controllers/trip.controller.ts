import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Trip } from '../models/Trip';
import { AppError, catchAsync } from '../utils/errors';
import { getAuthUser } from '../types/auth.helpers';
import { geocodeDestination } from '../services/geocoding.service';
import { generateItinerary, regenerateDayActivities, generateBudgetEstimate, generateHotelSuggestions } from '../services/gemini.service';
import type { DayDiff, ActivityShape } from '../types/trip.types';

// ─── POST /api/trips ──────────────────────────────────────────────────────────
// Synchronous: geocode → generate → validate → save → respond (Issue-3 amendment)
export const createTrip = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);

  const {
    destination,
    durationDays,
    budgetTier,
    interests,
    startDate,
  } = req.body as {
    destination?: string;
    durationDays?: number;
    budgetTier?: string;
    interests?: string[];
    startDate?: string | null;
  };

  // ── Input validation ───────────────────────────────────────────────────────
  if (!destination?.trim()) throw new AppError('Destination is required.', 400);
  if (!durationDays || durationDays < 1 || durationDays > 30) {
    throw new AppError('Duration must be between 1 and 30 days.', 400);
  }
  if (!['Low', 'Medium', 'High'].includes(budgetTier ?? '')) {
    throw new AppError('Budget tier must be Low, Medium, or High.', 400);
  }
  if (!Array.isArray(interests) || interests.length === 0) {
    throw new AppError('At least one interest is required.', 400);
  }

  const safeInterests = interests
    .map((i) => String(i).trim())
    .filter(Boolean)
    .slice(0, 10); // cap at 10

  // ── Step 1: Geocode destination ────────────────────────────────────────────
  console.log(`[Trip] Geocoding "${destination}"...`);
  const geoResult = await geocodeDestination(destination);
  if (geoResult) {
    console.log(`[Trip] Geocoded to (${geoResult.lat}, ${geoResult.lng}) — ${geoResult.resolvedName}`);
  } else {
    console.warn(`[Trip] Geocoding failed for "${destination}" — coordinates will be null`);
  }

  // ── Step 2: Generate itinerary via Gemini ──────────────────────────────────
  console.log(`[Trip] Generating itinerary for "${destination}" (${durationDays}d, ${budgetTier})...`);
  const generated = await generateItinerary({
    destination: geoResult?.resolvedName ?? destination,
    durationDays: Number(durationDays),
    budgetTier: budgetTier as 'Low' | 'Medium' | 'High',
    interests: safeInterests,
    startDate: startDate ?? null,
  });

  // ── Step 3: Save to MongoDB ────────────────────────────────────────────────
  const trip = await Trip.create({
    userId: new mongoose.Types.ObjectId(userId),
    destination: destination.trim(),
    startDate: startDate ? new Date(startDate) : null,
    durationDays: Number(durationDays),
    budgetTier,
    interests: safeInterests,
    destinationLat: geoResult?.lat ?? undefined,
    destinationLng: geoResult?.lng ?? undefined,
    itinerary: generated.itinerary,
    hotels: generated.hotels,
    estimatedBudget: generated.estimatedBudget,
    confidenceScore: 100, // Phase 8 will compute this from risk flags
    riskFlags: [],
    status: 'ready',
  });

  console.log(`[Trip] Created trip ${trip._id} for user ${userId}`);
  res.status(201).json({ trip });
});

// ─── GET /api/trips ───────────────────────────────────────────────────────────
// Returns only summary fields (no full itinerary) to keep the list fast
export const getTrips = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);

  const trips = await Trip.find({ userId })
    .select('destination durationDays budgetTier confidenceScore status startDate createdAt updatedAt')
    .sort({ createdAt: -1 });

  res.status(200).json({ trips });
});

// ─── GET /api/trips/:id ───────────────────────────────────────────────────────
export const getTripById = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId } = req.params;

  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) {
    // Same 404 whether the trip doesn't exist OR belongs to another user
    // Never reveal that a resource exists but is forbidden (prevents enumeration)
    throw new AppError('Trip not found.', 404);
  }

  res.status(200).json({ trip });
});

// ─── DELETE /api/trips/:id ────────────────────────────────────────────────────
export const deleteTrip = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId } = req.params;

  const trip = await Trip.findOneAndDelete({ _id: tripId, userId });
  if (!trip) {
    throw new AppError('Trip not found.', 404);
  }

  res.status(200).json({ message: 'Trip deleted successfully.' });
});

// ─── POST /api/trips/:id/days/:dayNumber/activities ───────────────────────────
export const addActivity = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId, dayNumber: dayNumberStr } = req.params;
  const dayNumber = parseInt(dayNumberStr, 10);

  if (isNaN(dayNumber)) throw new AppError('Invalid day number.', 400);

  const { title, description, estimatedCostUSD, timeOfDay, lat, lng } = req.body as {
    title?: string;
    description?: string;
    estimatedCostUSD?: number;
    timeOfDay?: string;
    lat?: number;
    lng?: number;
  };

  if (!title?.trim()) throw new AppError('Activity title is required.', 400);
  if (!['Morning', 'Afternoon', 'Evening'].includes(timeOfDay ?? '')) {
    throw new AppError('timeOfDay must be Morning, Afternoon, or Evening.', 400);
  }

  // Ownership check — same { _id, userId } pattern as all other routes
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const day = trip.itinerary.find((d) => d.dayNumber === dayNumber);
  if (!day) throw new AppError(`Day ${dayNumber} not found on this trip.`, 404);

  // Double-cast: IActivity[] → unknown → any to satisfy Mongoose's DocumentArray push
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (day.activities as unknown as any[]).push({
    title: title.trim(),
    description: description?.trim() ?? '',
    estimatedCostUSD: Number(estimatedCostUSD) || 0,
    timeOfDay,
    ...(lat !== undefined && { lat: Number(lat) }),
    ...(lng !== undefined && { lng: Number(lng) }),
  });

  await trip.save();
  console.log(`[Trip] Added activity to day ${dayNumber} of trip ${tripId}`);
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

  const activityIndex = day.activities.findIndex(
    (a) => a._id.toString() === activityId
  );
  if (activityIndex === -1) throw new AppError('Activity not found.', 404);

  day.activities.splice(activityIndex, 1);
  await trip.save();

  console.log(`[Trip] Removed activity ${activityId} from day ${dayNumber} of trip ${tripId}`);
  res.status(200).json({ trip });
});

// ─── POST /api/trips/:id/days/:dayNumber/regenerate ───────────────────────────
export const regenerateDay = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId, dayNumber: dayNumberStr } = req.params;
  const dayNumber = parseInt(dayNumberStr, 10);

  if (isNaN(dayNumber)) throw new AppError('Invalid day number.', 400);

  const { userFeedback, riskContext } = req.body as {
    userFeedback?: string;
    riskContext?: string;
  };

  if (!userFeedback?.trim() && !riskContext?.trim()) {
    throw new AppError('At least userFeedback or riskContext is required.', 400);
  }

  // Ownership check
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  const day = trip.itinerary.find((d) => d.dayNumber === dayNumber);
  if (!day) throw new AppError(`Day ${dayNumber} not found on this trip.`, 404);

  // Capture the "before" state before any mutation
  const before: DayDiff['before'] = day.activities.map((a) => ({
    _id: a._id.toString(),
    title: a.title,
    description: a.description,
    estimatedCostUSD: a.estimatedCostUSD,
    timeOfDay: a.timeOfDay,
    lat: a.lat,
    lng: a.lng,
  }));

  console.log(`[Trip] Regenerating day ${dayNumber} of trip ${tripId}...`);

  // Call Gemini with the full itinerary context
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

  // Replace activities on the day subdocument
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  day.activities = newActivities as any;
  await trip.save();

  // Reload to get fresh Mongoose-assigned _ids on the new subdocs
  const updated = await Trip.findById(trip._id);
  const updatedDay = updated!.itinerary.find((d) => d.dayNumber === dayNumber)!;

  const after: DayDiff['after'] = updatedDay.activities.map((a) => ({
    _id: a._id.toString(),
    title: a.title,
    description: a.description,
    estimatedCostUSD: a.estimatedCostUSD,
    timeOfDay: a.timeOfDay,
    lat: a.lat,
    lng: a.lng,
  }));

  // All new activities are "changed" — highlight all of them
  const changedActivityIds = (after as Array<ActivityShape & { _id: string }>).map((a) => a._id);

  const diff: DayDiff = { dayNumber, before, after, changedActivityIds };

  console.log(`[Trip] Regenerated day ${dayNumber}: ${before.length} → ${after.length} activities`);
  res.status(200).json({ trip: updated, diff });
});

// ─── POST /api/trips/:id/budget/refresh ───────────────────────────────────────
export const refreshBudget = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId } = req.params;

  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  // Compute actual activities cost from the stored itinerary
  const activitiesTotalCost = trip.itinerary.reduce(
    (daySum, day) =>
      daySum + day.activities.reduce((actSum, act) => actSum + act.estimatedCostUSD, 0),
    0
  );

  console.log(`[Trip] Refreshing budget for trip ${tripId}, activities cost: $${activitiesTotalCost}`);

  const estimatedBudget = await generateBudgetEstimate({
    destination: trip.destination,
    durationDays: trip.durationDays,
    budgetTier: trip.budgetTier,
    interests: trip.interests,
    activitiesTotalCost,
  });

  trip.estimatedBudget = estimatedBudget;
  await trip.save();

  console.log(`[Trip] Budget refreshed — total $${estimatedBudget.total}`);
  res.status(200).json({ estimatedBudget });
});

// ─── POST /api/trips/:id/hotels ───────────────────────────────────────────────
export const refreshHotels = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { id: userId } = getAuthUser(req);
  const { id: tripId } = req.params;

  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw new AppError('Trip not found.', 404);

  console.log(`[Trip] Refreshing hotels for trip ${tripId} (${trip.destination})`);

  const hotels = await generateHotelSuggestions({
    destination: trip.destination,
    durationDays: trip.durationDays,
    budgetTier: trip.budgetTier,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trip.hotels = hotels as any;
  await trip.save();

  console.log(`[Trip] Hotels refreshed — ${hotels.length} suggestions`);
  res.status(200).json({ hotels });
});
