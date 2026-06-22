/**
 * Risk Service — three-algorithm risk assessment engine.
 *
 * Algorithms:
 *   1. Pacing Risk   — haversine distance between consecutive same-day activities
 *   2. Budget Risk   — actual vs expected spend by tier + per-day activity cost spike
 *   3. Weather Risk  — Open-Meteo forecast (≤16 days) or archive climatology (>16 days / no date)
 *
 * Confidence Score: 100 − (15×high + 8×medium + 3×low), clamped 0–100
 *
 * WEATHER_MOCK env var: when "true", returns a canned Day-2 medium flag without any HTTP call.
 */

import { logger } from '../utils/logger';

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Shape the risk pass writes back to the Trip document */
export interface RiskFlagPayload {
  type: 'pacing' | 'budget' | 'weather';
  severity: 'low' | 'medium' | 'high';
  dayNumber: number | null;   // null = trip-level flag (e.g., total budget overrun)
  message: string;
  suggestedFix: string;
}

export interface RiskPassResult {
  confidenceScore: number;
  riskFlags: RiskFlagPayload[];
}

// ─── Minimal trip shape needed by the risk pass ───────────────────────────────

interface ActivityInput {
  title: string;
  estimatedCostUSD: number;
  lat?: number | null;
  lng?: number | null;
}

interface DayInput {
  dayNumber: number;
  activities: ActivityInput[];
}

export interface TripInput {
  destination: string;
  durationDays: number;
  budgetTier: 'Low' | 'Medium' | 'High';
  startDate?: Date | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  itinerary: DayInput[];
  estimatedBudget?: {
    transport: number;
    accommodation: number;
    food: number;
    activities: number;
    total: number;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Expected ALL-IN daily spend per tier (transport amortised + accommodation + food + activities).
 * These figures are derived from typical travel-industry cost benchmarks:
 *   Low:    ~$100/day covers a budget hostel, local transport, cheap eats, and a free/cheap activity.
 *   Medium: ~$300/day covers a mid-range hotel, occasional taxis, sit-down restaurants, and paid attractions.
 *   High:   ~$700/day covers luxury accommodation, private transfers, fine dining, and premium experiences.
 */
const EXPECTED_DAILY_TOTAL_USD: Record<string, number> = {
  Low: 100,
  Medium: 300,
  High: 700,
};

/**
 * Pacing thresholds in kilometres between consecutive same-day activities.
 *
 * 15 km — at typical city walking/transit speeds this takes 30–45 min each way,
 *          which starts to noticeably eat into a half-day activity slot.
 * 35 km — at this distance, travel time almost certainly exceeds 1 hour each way;
 *          the day effectively requires a dedicated transit segment to be feasible.
 *
 * Values are intentionally coarser than point-to-point routing because we only
 * have GPS coordinates, not actual road/transit routes.
 */
const PACING_MEDIUM_KM = 15;
const PACING_HIGH_KM   = 35;

// ─── Algorithm 1: Haversine pacing check ─────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function checkPacingRisk(itinerary: DayInput[]): RiskFlagPayload[] {
  const flags: RiskFlagPayload[] = [];

  for (const day of itinerary) {
    const acts = day.activities;
    for (let i = 0; i < acts.length - 1; i++) {
      const a = acts[i];
      const b = acts[i + 1];

      // Skip pairs where either coordinate is missing — treat as no data,
      // never infer zero distance, which would produce false negatives.
      if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
        logger.debug(
          `[Risk/Pacing] Day ${day.dayNumber}: skipping "${a.title}" → "${b.title}" — missing lat/lng`
        );
        continue;
      }

      const km = haversineKm(a.lat, a.lng, b.lat, b.lng);

      if (km > PACING_HIGH_KM) {
        flags.push({
          type: 'pacing',
          severity: 'high',
          dayNumber: day.dayNumber,
          message: `Day ${day.dayNumber}: "${a.title}" to "${b.title}" is ${km.toFixed(0)} km — a transit buffer is almost certainly needed.`,
          suggestedFix: `Add a travel/transit activity between "${a.title}" and "${b.title}", or replace one with a venue closer to the other.`,
        });
      } else if (km > PACING_MEDIUM_KM) {
        flags.push({
          type: 'pacing',
          severity: 'medium',
          dayNumber: day.dayNumber,
          message: `Day ${day.dayNumber}: "${a.title}" to "${b.title}" is ${km.toFixed(0)} km apart — may need transit time.`,
          suggestedFix: `Allow extra travel time between "${a.title}" and "${b.title}" on Day ${day.dayNumber}, or swap one for a nearer alternative.`,
        });
      }
    }
  }

  return flags;
}

// ─── Algorithm 2: Budget risk ─────────────────────────────────────────────────

function checkBudgetRisk(trip: TripInput): RiskFlagPayload[] {
  const flags: RiskFlagPayload[] = [];
  const { estimatedBudget, budgetTier, durationDays, itinerary } = trip;

  if (!estimatedBudget) return flags;

  const expectedPerDay = EXPECTED_DAILY_TOTAL_USD[budgetTier] ?? 300;
  const expectedTotal = expectedPerDay * durationDays;
  const ratio = estimatedBudget.total / expectedTotal;

  // >150% of expected spend = high risk: significantly over-budget
  // >120% of expected spend = medium risk: moderately over-budget
  // These ratios give reasonable headroom for exchange-rate variation and
  // premium one-off experiences before triggering a flag.
  if (ratio > 1.5) {
    flags.push({
      type: 'budget',
      severity: 'high',
      dayNumber: null,
      message: `Total estimated cost ($${estimatedBudget.total.toLocaleString()}) is ${Math.round(ratio * 100)}% of the expected ${budgetTier}-budget range — significantly over-budget.`,
      suggestedFix: 'Switch to a lower accommodation tier, choose economy transport, or shorten the trip by 1–2 days.',
    });
  } else if (ratio > 1.2) {
    flags.push({
      type: 'budget',
      severity: 'medium',
      dayNumber: null,
      message: `Total estimated cost ($${estimatedBudget.total.toLocaleString()}) is ${Math.round(ratio * 100)}% of the expected ${budgetTier}-budget range.`,
      suggestedFix: 'Consider choosing mid-range accommodation or replacing one paid activity per day with a free alternative.',
    });
  }

  // Per-day activity cost spike: any single day costing >2× the daily average
  // suggests an outlier activity that may bust the overall budget.
  if (estimatedBudget.activities > 0) {
    const avgDailyActivities = estimatedBudget.activities / durationDays;
    for (const day of itinerary) {
      const dayCost = day.activities.reduce((s, a) => s + a.estimatedCostUSD, 0);
      if (dayCost > avgDailyActivities * 2) {
        flags.push({
          type: 'budget',
          severity: 'medium',
          dayNumber: day.dayNumber,
          message: `Day ${day.dayNumber} activity costs ($${dayCost}) are more than 2× the average daily activities budget ($${Math.round(avgDailyActivities)}).`,
          suggestedFix: `Replace one paid activity on Day ${day.dayNumber} with a free or low-cost alternative to rebalance spend.`,
        });
      }
    }
  }

  return flags;
}

// ─── Algorithm 3: Weather risk ────────────────────────────────────────────────

const WEATHER_MOCK_FLAG: RiskFlagPayload = {
  type: 'weather',
  severity: 'medium',
  dayNumber: 2,
  message: 'Day 2: Moderate chance of rain expected (WEATHER_MOCK — seasonal estimate, not a live forecast).',
  suggestedFix: 'Consider moving outdoor activities on Day 2 to indoor alternatives or carry rain gear.',
};

type PrecipProb = number; // 0–100

async function fetchForecastProbs(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<PrecipProb[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_probability_max` +
    `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo forecast HTTP ${res.status}`);
  const data = await res.json() as { daily?: { precipitation_probability_max?: (number | null)[] } };
  return (data.daily?.precipitation_probability_max ?? []).map((v) => v ?? 0);
}

async function fetchClimatologyProbs(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<PrecipProb[]> {
  // Proxy climatology via last year's archive data for the same calendar period.
  // This gives a reasonable seasonal baseline when the trip is too far out for
  // a live 16-day forecast.
  const toDate = (s: string, yearOffset: number) => {
    const d = new Date(s);
    d.setFullYear(d.getFullYear() + yearOffset);
    return d.toISOString().split('T')[0];
  };

  const archiveStart = toDate(startDate, -1);
  const archiveEnd = toDate(endDate, -1);

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_sum` +
    `&timezone=auto&start_date=${archiveStart}&end_date=${archiveEnd}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo archive HTTP ${res.status}`);
  const data = await res.json() as { daily?: { precipitation_sum?: (number | null)[] } };

  // Convert mm/day → approximate probability buckets.
  // Thresholds are conservative: >10 mm/day is typically classified as "heavy"
  // rain by meteorological standards; >5 mm is "moderate."
  return (data.daily?.precipitation_sum ?? []).map((mm) => {
    if (mm == null) return 0;
    if (mm > 10) return 75; // heavy rain → high probability flag
    if (mm > 5)  return 50; // moderate rain
    return 20;              // light / dry
  });
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function checkWeatherRisk(trip: TripInput): Promise<RiskFlagPayload[]> {
  if (process.env.WEATHER_MOCK === 'true') {
    logger.info('[Risk/Weather] WEATHER_MOCK=true — returning mock flag, skipping Open-Meteo');
    return [WEATHER_MOCK_FLAG];
  }

  const { destinationLat, destinationLng, startDate, durationDays, itinerary } = trip;

  if (destinationLat == null || destinationLng == null) {
    logger.info('[Risk/Weather] Skipping — no destination coordinates stored');
    return [];
  }

  const now = new Date();
  const tripStart = startDate ? new Date(startDate) : null;
  const daysUntilTrip = tripStart
    ? Math.ceil((tripStart.getTime() - now.getTime()) / 86_400_000)
    : Infinity;

  const windowStart = tripStart ?? now;
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + durationDays - 1);

  let precipProbs: PrecipProb[] = [];
  let isSeasonalEstimate = false;

  try {
    if (tripStart && daysUntilTrip <= 16) {
      logger.info(`[Risk/Weather] Using live forecast API — trip starts in ${daysUntilTrip} days`);
      precipProbs = await fetchForecastProbs(
        destinationLat, destinationLng, fmt(windowStart), fmt(windowEnd)
      );
    } else {
      isSeasonalEstimate = true;
      const reason = tripStart ? `${daysUntilTrip} days out` : 'no start date';
      logger.info(`[Risk/Weather] Using climatology (archive) — ${reason}`);
      precipProbs = await fetchClimatologyProbs(
        destinationLat, destinationLng, fmt(windowStart), fmt(windowEnd)
      );
    }
  } catch (err) {
    logger.warn(`[Risk/Weather] API call failed (${String(err)}) — skipping weather flags`);
    return [];
  }

  const note = isSeasonalEstimate ? ' (seasonal estimate — not a live forecast)' : '';
  const flags: RiskFlagPayload[] = [];

  itinerary.forEach((day, i) => {
    const prob = precipProbs[i];
    if (prob == null) return;

    if (prob > 70) {
      flags.push({
        type: 'weather',
        severity: 'high',
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber}: High precipitation probability (${Math.round(prob)}%)${note} — outdoor activities may be disrupted.`,
        suggestedFix: `Move outdoor activities on Day ${day.dayNumber} indoors or swap for weather-proof alternatives.`,
      });
    } else if (prob > 40) {
      flags.push({
        type: 'weather',
        severity: 'medium',
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber}: Moderate rain chance (${Math.round(prob)}%)${note} — plan indoor fallbacks.`,
        suggestedFix: `Have a covered or indoor backup ready for Day ${day.dayNumber} activities.`,
      });
    }
  });

  return flags;
}

// ─── Confidence score ─────────────────────────────────────────────────────────

function computeConfidenceScore(flags: RiskFlagPayload[]): number {
  const high = flags.filter((f) => f.severity === 'high').length;
  const med  = flags.filter((f) => f.severity === 'medium').length;
  const low  = flags.filter((f) => f.severity === 'low').length;
  // Weights: high=15, medium=8, low=3
  // A trip with 2 high flags drops to 70 — still usable but clearly needing attention.
  // A trip with 5 medium flags drops to 60. Score is clamped at 0 so it never goes negative.
  return Math.max(0, Math.min(100, 100 - 15 * high - 8 * med - 3 * low));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * runRiskPass — executes all three risk algorithms concurrently.
 * Returns { confidenceScore, riskFlags } — does NOT mutate or save the trip.
 * The caller is responsible for persisting the result.
 */
export async function runRiskPass(trip: TripInput): Promise<RiskPassResult> {
  logger.info(`[Risk] Starting pass for "${trip.destination}" (${trip.durationDays}d, ${trip.budgetTier})`);

  const [pacingFlags, budgetFlags, weatherFlags] = await Promise.all([
    Promise.resolve(checkPacingRisk(trip.itinerary)),
    Promise.resolve(checkBudgetRisk(trip)),
    checkWeatherRisk(trip),
  ]);

  const allFlags = [...pacingFlags, ...budgetFlags, ...weatherFlags];
  const confidenceScore = computeConfidenceScore(allFlags);

  logger.info(
    `[Risk] Done — score ${confidenceScore} | pacing:${pacingFlags.length} budget:${budgetFlags.length} weather:${weatherFlags.length}`
  );

  return { confidenceScore, riskFlags: allFlags };
}
