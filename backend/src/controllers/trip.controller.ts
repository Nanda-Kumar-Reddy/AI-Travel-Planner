import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Trip } from '../models/Trip';
import { AppError, catchAsync } from '../utils/errors';
import { getAuthUser } from '../types/auth.helpers';
import { geocodeDestination } from '../services/geocoding.service';
import { generateItinerary } from '../services/gemini.service';

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
