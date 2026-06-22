/**
 * Gemini Service — AI itinerary generation.
 *
 * Models (tried in order):
 *   Primary:  gemini-2.5-flash-preview-05-20
 *   Fallback: gemini-2.5-flash
 *
 * Retry strategy (withExponentialBackoff):
 *   Up to 5 retries with delays 1s → 2s → 4s → 8s → 16s.
 *   Retries on transient errors (network, timeout, server-side 5xx, 429).
 *   Aborts immediately on non-retryable errors: invalid API key, safety blocks,
 *   invalid argument — retrying those would never succeed.
 *
 * Error classification:
 *   After exhausting retries, the error code from the Gemini SDK is inspected
 *   and mapped to a specific AppError subtype so the controller always has
 *   enough information to return the right user-facing message.
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { z } from 'zod';
import {
  AppError,
  aiRateLimitedError,
  aiUnreachableError,
  aiInvalidOutputError,
  aiAuthError,
} from '../utils/errors';
import { logger } from '../utils/logger';

// ─── Zod schema for the Gemini response ──────────────────────────────────────

const ActivityZ = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedCostUSD: z.number().min(0),
  timeOfDay: z.enum(['Morning', 'Afternoon', 'Evening']),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const ItineraryDayZ = z.object({
  dayNumber: z.number().int().min(1),
  activities: z.array(ActivityZ).min(1).max(4),
});

const HotelZ = z.object({
  name: z.string().min(1),
  tier: z.enum(['Budget', 'Mid-Range', 'Luxury']),
  pricePerNightUSD: z.number().min(0),
  description: z.string().min(1),
  rating: z.number().min(1).max(5).optional(),
});

const EstimatedBudgetZ = z.object({
  transport: z.number().min(0),
  accommodation: z.number().min(0),
  food: z.number().min(0),
  activities: z.number().min(0),
  total: z.number().min(0),
});

export const TripGenerationResponseZ = z.object({
  itinerary: z.array(ItineraryDayZ).min(1),
  hotels: z.array(HotelZ).min(1).max(3),
  estimatedBudget: EstimatedBudgetZ,
});

export type TripGenerationResponse = z.infer<typeof TripGenerationResponseZ>;

// ─── Exponential backoff helper ───────────────────────────────────────────────

// Delay schedule: 1s, 2s, 4s, 8s, 16s — gives the AI provider ~31s total
// to recover from transient overload before we give up.
const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * withExponentialBackoff — retries an async operation with exponential delays.
 *
 * Retryable: network errors, timeouts, HTTP 429 (rate limit), HTTP 5xx.
 * Non-retryable: invalid API key, safety blocks, invalid argument — these
 * will never succeed regardless of how many times we retry.
 *
 * Throws a classified AppError after all retries are exhausted, based on
 * the error type of the final failure.
 */
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = BACKOFF_DELAYS_MS[attempt - 1] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
        logger.info(`[${label}] Retry ${attempt}/${maxRetries} — waiting ${delayMs}ms...`);
        await sleep(delayMs);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${label}] Attempt ${attempt + 1} failed: ${msg}`);

      if (isNonRetryable(err)) {
        logger.warn(`[${label}] Non-retryable error — aborting retries`);
        break;
      }
    }
  }

  // Map the last error to the correct classified AppError
  throw classifyGeminiError(lastError, label);
}

/**
 * isNonRetryable — returns true for errors where retrying would never help.
 * API key issues, content blocks, and invalid arguments are permanent failures.
 */
function isNonRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('invalid argument')
  );
}

/**
 * classifyGeminiError — maps a raw error from the Gemini SDK into the
 * appropriate typed AppError so callers get a specific user-facing message.
 *
 * Priority order: auth → rate-limit → network/timeout → generic AI error.
 */
function classifyGeminiError(err: unknown, label: string): AppError {
  if (!(err instanceof Error)) return aiUnreachableError();
  const msg = err.message.toLowerCase();

  if (msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
    // Log the real cause server-side so ops can act on it, but never expose
    // the credential nature of the failure to the user.
    logger.error(`[${label}] AI authentication failure — check GEMINI_API_KEY configuration`, err.message);
    return aiAuthError();
  }

  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) {
    logger.warn(`[${label}] AI rate limit exhausted after all retries`);
    return aiRateLimitedError();
  }

  if (
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout')
  ) {
    logger.warn(`[${label}] AI service unreachable: ${err.message}`);
    return aiUnreachableError();
  }

  // Catch-all for other Gemini errors (e.g., safety block after retry abort)
  logger.warn(`[${label}] Unclassified AI error: ${err.message}`);
  return aiUnreachableError();
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

interface PromptParams {
  destination: string;
  durationDays: number;
  budgetTier: 'Low' | 'Medium' | 'High';
  interests: string[];
  startDate?: string | null;
}

const BUDGET_GUIDANCE = {
  Low: 'budget-conscious, max $50/person/day total including accommodation',
  Medium: 'mid-range, $100–$200/person/day total including accommodation',
  High: 'premium/luxury, $300+/person/day total including accommodation',
};

function buildPrompt(params: PromptParams, isRetry = false): string {
  const { destination, durationDays, budgetTier, interests, startDate } = params;
  const interestList = interests.length > 0 ? interests.join(', ') : 'general sightseeing';
  const budgetGuidance = BUDGET_GUIDANCE[budgetTier];
  const dateHint = startDate
    ? `The trip starts on ${startDate}. Consider seasonal factors, weather, and local events.`
    : 'No specific start date. Use typical/average seasonal conditions.';

  const retryPrefix = isRetry
    ? 'IMPORTANT: Your previous response failed JSON schema validation. Ensure all required fields are present and correctly typed.\n\n'
    : '';

  return `${retryPrefix}You are an expert travel planner. Generate a detailed ${durationDays}-day itinerary for a trip to ${destination}.

Trip parameters:
- Destination: ${destination}
- Duration: ${durationDays} days
- Budget tier: ${budgetTier} (${budgetGuidance})
- Interests: ${interestList}
- Date context: ${dateHint}

Instructions:
1. Create exactly ${durationDays} itinerary days (dayNumber 1 through ${durationDays}).
2. Each day must have 2–4 activities spanning Morning, Afternoon, and/or Evening.
3. Each activity must include approximate GPS coordinates (lat/lng) for the specific venue/location.
4. Provide exactly 3 hotel recommendations: one Budget, one Mid-Range, one Luxury.
5. Estimate realistic USD costs for all activities and hotels based on the budget tier.
6. Calculate the total estimated budget broken down by: transport (flights/trains to destination), accommodation, food, activities.
7. The total must equal transport + accommodation + food + activities (for ${durationDays} days, per person).
8. Use specific real place names, landmarks, restaurants, and venues — no generic descriptions.

Respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "itinerary": [
    {
      "dayNumber": 1,
      "activities": [
        {
          "title": "string",
          "description": "string (2-3 sentences with specific details)",
          "estimatedCostUSD": number,
          "timeOfDay": "Morning" | "Afternoon" | "Evening",
          "lat": number,
          "lng": number
        }
      ]
    }
  ],
  "hotels": [
    {
      "name": "string",
      "tier": "Budget" | "Mid-Range" | "Luxury",
      "pricePerNightUSD": number,
      "description": "string",
      "rating": number (1.0-5.0)
    }
  ],
  "estimatedBudget": {
    "transport": number,
    "accommodation": number,
    "food": number,
    "activities": number,
    "total": number
  }
}`;
}

// ─── Gemini client ────────────────────────────────────────────────────────────

const PRIMARY_MODEL = 'gemini-2.5-flash-preview-05-20';
const FALLBACK_MODEL = 'gemini-2.5-flash';

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('[Gemini] GEMINI_API_KEY environment variable is not set');
    throw aiAuthError();
  }
  return new GoogleGenerativeAI(apiKey);
}

async function callGemini(prompt: string): Promise<string> {
  const client = getClient();

  // Try primary model first; fall back only on model-not-found/unavailable errors.
  // Other errors (auth, rate-limit, network) are re-thrown immediately so
  // withExponentialBackoff can inspect them and decide whether to retry.
  for (const modelName of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      logger.info(`[Gemini] Response received via ${modelName} (${text.length} chars)`);
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isModelError =
        msg.includes('not found') ||
        msg.includes('404') ||
        msg.includes('not supported') ||
        msg.includes('unavailable');

      if (!isModelError || modelName === FALLBACK_MODEL) throw err;
      logger.warn(`[Gemini] Model ${modelName} unavailable — trying fallback ${FALLBACK_MODEL}`);
    }
  }

  // Unreachable: loop above always throws on the fallback model
  throw aiUnreachableError();
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * generateItinerary — calls Gemini with exponential backoff, validates with Zod,
 * retries once with an amended prompt if validation fails.
 *
 * Throws a classified AppError (AI_RATE_LIMITED, AI_UNREACHABLE, AI_AUTH_ERROR,
 * or AI_INVALID_OUTPUT) — never a raw Error or generic AppError.
 */
export async function generateItinerary(
  params: PromptParams
): Promise<TripGenerationResponse> {
  const rawText = await withExponentialBackoff(
    () => callGemini(buildPrompt(params, false)),
    'Gemini'
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // JSON parse failed on attempt 1 — retry with an amended prompt
    logger.warn('[Gemini] JSON parse failed on first attempt — retrying with amended prompt');
    const retryText = await withExponentialBackoff(
      () => callGemini(buildPrompt(params, true)),
      'Gemini-Retry'
    );
    try {
      parsed = JSON.parse(retryText);
    } catch {
      logger.error('[Gemini] JSON parse failed on retry — giving up');
      throw aiInvalidOutputError();
    }
  }

  const validation = TripGenerationResponseZ.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => i.message).join('; ');
    logger.warn(`[Gemini] Zod validation failed: ${issues} — retrying with amended prompt`);

    const retryText = await withExponentialBackoff(
      () => callGemini(buildPrompt(params, true)),
      'Gemini-ZodRetry'
    );

    let retryParsed: unknown;
    try {
      retryParsed = JSON.parse(retryText);
    } catch {
      logger.error('[Gemini] JSON parse failed on Zod-retry');
      throw aiInvalidOutputError();
    }

    const retryValidation = TripGenerationResponseZ.safeParse(retryParsed);
    if (!retryValidation.success) {
      const retryIssues = retryValidation.error.issues.map((i) => i.message).join('; ');
      logger.error(`[Gemini] Zod validation failed on retry: ${retryIssues}`);
      throw aiInvalidOutputError();
    }

    logger.info('[Gemini] Retry validation passed ✓');
    return retryValidation.data;
  }

  logger.info(`[Gemini] Validation passed ✓ — ${validation.data.itinerary.length} days generated`);
  return validation.data;
}

// ─── Single-day regeneration ──────────────────────────────────────────────────

/** Zod schema for validating a single regenerated day (activities array only) */
export const RegenerateDayResponseZ = z.object({
  activities: z.array(ActivityZ).min(1).max(4),
});

export type RegenerateDayResponse = z.infer<typeof RegenerateDayResponseZ>;

interface RegenerateDayParams {
  destination: string;
  durationDays: number;
  budgetTier: 'Low' | 'Medium' | 'High';
  interests: string[];
  /** Full itinerary context — prevents Gemini from duplicating activities */
  fullItinerary: Array<{ dayNumber: number; activities: Array<{ title: string; timeOfDay: string }> }>;
  dayNumber: number;
  userFeedback?: string;
  riskContext?: string;
}

function buildRegenerateDayPrompt(params: RegenerateDayParams, isRetry = false): string {
  const { destination, budgetTier, interests, fullItinerary, dayNumber, userFeedback, riskContext } = params;
  const budgetGuidance = BUDGET_GUIDANCE[budgetTier];

  const otherDays = fullItinerary
    .filter((d) => d.dayNumber !== dayNumber)
    .map((d) => `  Day ${d.dayNumber}: ${d.activities.map((a) => a.title).join(' / ')}`)
    .join('\n');

  const currentDayActivities = fullItinerary
    .find((d) => d.dayNumber === dayNumber)
    ?.activities.map((a) => `  - ${a.title} (${a.timeOfDay})`)
    .join('\n') ?? '  (none)';

  const feedbackLines = [
    userFeedback ? `User feedback: "${userFeedback}"` : '',
    riskContext ? `Risk issue to resolve: "${riskContext}"` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const retryPrefix = isRetry
    ? 'IMPORTANT: Your previous response failed schema validation. Return ONLY the JSON object with an "activities" array.\n\n'
    : '';

  // Targeted risk-fix prompt — used when riskContext is present without userFeedback
  if (riskContext && !userFeedback) {
    return `${retryPrefix}You are a travel risk analyst and itinerary optimizer. A risk flag has been detected on Day ${dayNumber} of a trip to ${destination}:

RISK ISSUE: "${riskContext}"

Your task: replace Day ${dayNumber}'s activities with a set that RESOLVES this specific risk while keeping the trip enjoyable.

Trip context:
- Budget: ${budgetTier} (${budgetGuidance})
- Interests: ${interests.join(', ')}
- Duration: ${params.durationDays} days

Other days (do NOT duplicate any of these activities):
${otherDays || '  (no other days)'}

Current Day ${dayNumber} activities being replaced:
${currentDayActivities}

Resolution requirements:
1. If this is a PACING risk: choose venues that are geographically clustered (within 5 km of each other) to eliminate transit problems.
2. If this is a BUDGET risk: replace costly activities with free or low-cost alternatives that still match interests.
3. If this is a WEATHER risk: choose indoor or weather-proof venues (museums, galleries, covered markets, etc.).
4. Every activity must include real GPS coordinates (lat/lng).
5. Do NOT repeat any activity from other days.
6. Keep 2–4 activities across Morning / Afternoon / Evening.

Respond with ONLY this JSON (no markdown):
{
  "activities": [
    {
      "title": "string",
      "description": "string (2–3 sentences explaining how this resolves the risk)",
      "estimatedCostUSD": number,
      "timeOfDay": "Morning" | "Afternoon" | "Evening",
      "lat": number,
      "lng": number
    }
  ]
}`;
  }

  // General regeneration prompt — used when userFeedback is present
  return `${retryPrefix}You are an expert travel planner. Regenerate ONLY the activities for Day ${dayNumber} of a trip to ${destination}.

Trip context:
- Budget: ${budgetTier} (${budgetGuidance})
- Interests: ${interests.join(', ')}
- Total trip duration: ${params.durationDays} days

Activities on OTHER days (do NOT repeat these):
${otherDays || '  (no other days)'}

Current Day ${dayNumber} activities being replaced:
${currentDayActivities}

Instructions to apply:
${feedbackLines}

Generate 2–4 completely NEW activities for Day ${dayNumber} that:
1. Directly address the feedback/risk context above
2. Do NOT duplicate any activity from other days
3. Include realistic approximate GPS coordinates for each specific venue
4. Stay within the ${budgetTier} budget tier
5. Spread across different times of day (Morning / Afternoon / Evening)
6. Use specific, real venue names — no generic descriptions

Respond with ONLY this JSON (no markdown fences, no explanation):
{
  "activities": [
    {
      "title": "string",
      "description": "string (2–3 sentences, specific details)",
      "estimatedCostUSD": number,
      "timeOfDay": "Morning" | "Afternoon" | "Evening",
      "lat": number,
      "lng": number
    }
  ]
}`;
}

/**
 * regenerateDayActivities — replaces one day's activities.
 * Validates with RegenerateDayResponseZ; one Zod-failure retry included.
 */
export async function regenerateDayActivities(
  params: RegenerateDayParams
): Promise<RegenerateDayResponse['activities']> {
  const rawText = await withExponentialBackoff(
    () => callGemini(buildRegenerateDayPrompt(params, false)),
    'Gemini-Regen'
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    logger.warn('[Gemini-Regen] JSON parse failed — retrying with amended prompt');
    const retryText = await withExponentialBackoff(
      () => callGemini(buildRegenerateDayPrompt(params, true)),
      'Gemini-Regen-Retry'
    );
    try { parsed = JSON.parse(retryText); }
    catch {
      logger.error('[Gemini-Regen] JSON parse failed on retry');
      throw aiInvalidOutputError();
    }
  }

  const validation = RegenerateDayResponseZ.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => i.message).join('; ');
    logger.warn(`[Gemini-Regen] Zod failed: ${issues} — retrying`);

    const retryText = await withExponentialBackoff(
      () => callGemini(buildRegenerateDayPrompt(params, true)),
      'Gemini-Regen-ZodRetry'
    );
    let retryParsed: unknown;
    try { retryParsed = JSON.parse(retryText); }
    catch {
      logger.error('[Gemini-Regen] JSON parse failed on Zod-retry');
      throw aiInvalidOutputError();
    }

    const retryV = RegenerateDayResponseZ.safeParse(retryParsed);
    if (!retryV.success) {
      logger.error('[Gemini-Regen] Zod validation failed on retry — giving up');
      throw aiInvalidOutputError();
    }
    logger.info('[Gemini-Regen] Retry validation passed ✓');
    return retryV.data.activities;
  }

  logger.info(`[Gemini-Regen] Validation passed ✓ — ${validation.data.activities.length} activities`);
  return validation.data.activities;
}

// ─── Budget estimation (standalone refresh) ───────────────────────────────────

export const BudgetRefreshResponseZ = EstimatedBudgetZ;
export type BudgetRefreshResponse = z.infer<typeof BudgetRefreshResponseZ>;

interface BudgetEstimateParams {
  destination: string;
  durationDays: number;
  budgetTier: 'Low' | 'Medium' | 'High';
  interests: string[];
  /** Sum of estimatedCostUSD across all planned activities — pinned into the response */
  activitiesTotalCost: number;
}

function buildBudgetPrompt(params: BudgetEstimateParams, isRetry = false): string {
  const { destination, durationDays, budgetTier, interests, activitiesTotalCost } = params;
  const budgetGuidance = BUDGET_GUIDANCE[budgetTier];
  const retryPrefix = isRetry
    ? 'IMPORTANT: Your previous response failed schema validation. Return ONLY the JSON object.\n\n'
    : '';

  return `${retryPrefix}You are a travel budget expert. Estimate the full trip cost breakdown for:
- Destination: ${destination}
- Duration: ${durationDays} days
- Budget tier: ${budgetTier} (${budgetGuidance})
- Traveller interests: ${interests.join(', ')}
- Planned activities cost (already computed): $${activitiesTotalCost} USD — use this exact number for "activities"

Estimate realistic USD amounts for the remaining categories:
- transport: round-trip flights/trains to ${destination} from a major hub (economy for Budget, business for Luxury)
- accommodation: total hotel cost for ${durationDays - 1} nights (use ${budgetTier} tier pricing)
- food: total meal costs for ${durationDays} days per person
- activities: MUST equal exactly ${activitiesTotalCost}
- total: MUST equal transport + accommodation + food + activities

Respond with ONLY valid JSON (no markdown):
{
  "transport": number,
  "accommodation": number,
  "food": number,
  "activities": ${activitiesTotalCost},
  "total": number
}`;
}

/**
 * generateBudgetEstimate — refreshes the trip budget.
 * Pins the activities cost to the passed activitiesTotalCost; estimates the rest.
 */
export async function generateBudgetEstimate(
  params: BudgetEstimateParams
): Promise<BudgetRefreshResponse> {
  const rawText = await withExponentialBackoff(
    () => callGemini(buildBudgetPrompt(params, false)),
    'Gemini-Budget'
  );

  let parsed: unknown;
  try { parsed = JSON.parse(rawText); }
  catch {
    const retry = await withExponentialBackoff(
      () => callGemini(buildBudgetPrompt(params, true)),
      'Gemini-Budget-Retry'
    );
    try { parsed = JSON.parse(retry); }
    catch {
      logger.error('[Gemini-Budget] JSON parse failed on retry');
      throw aiInvalidOutputError();
    }
  }

  const v = BudgetRefreshResponseZ.safeParse(parsed);
  if (!v.success) {
    const issues = v.error.issues.map((i) => i.message).join('; ');
    logger.warn(`[Gemini-Budget] Zod failed: ${issues}`);
    throw aiInvalidOutputError();
  }

  // Force-pin activities to the passed value to prevent model drift
  v.data.activities = params.activitiesTotalCost;
  v.data.total = v.data.transport + v.data.accommodation + v.data.food + v.data.activities;

  logger.info(`[Gemini-Budget] Estimate ready — total $${v.data.total}`);
  return v.data;
}

// ─── Hotel suggestions (standalone refresh) ───────────────────────────────────

export const HotelsRefreshResponseZ = z.object({
  hotels: z.array(HotelZ).length(3),
});
export type HotelsRefreshResponse = z.infer<typeof HotelsRefreshResponseZ>;

interface HotelSuggestionsParams {
  destination: string;
  durationDays: number;
  budgetTier: 'Low' | 'Medium' | 'High';
}

function buildHotelsPrompt(params: HotelSuggestionsParams, isRetry = false): string {
  const { destination, durationDays, budgetTier } = params;
  const retryPrefix = isRetry
    ? 'IMPORTANT: Your previous response failed schema validation. Return ONLY the JSON object with a "hotels" array of exactly 3 items.\n\n'
    : '';

  return `${retryPrefix}You are a hotel expert. Recommend exactly 3 real hotels in ${destination} for a ${durationDays}-night stay.

Rules:
- Exactly ONE hotel per tier: Budget, Mid-Range, Luxury (in that order in the array)
- "tier" must be exactly one of: "Budget", "Mid-Range", "Luxury"
- Use real hotel names — no fictional properties
- pricePerNightUSD should reflect the ${budgetTier} traveller's preference but include all three tiers
- rating must be between 1.0 and 5.0

Respond with ONLY valid JSON (no markdown):
{
  "hotels": [
    {
      "name": "string",
      "tier": "Budget",
      "pricePerNightUSD": number,
      "description": "string (2 sentences max)",
      "rating": number
    },
    { "name": "...", "tier": "Mid-Range", ... },
    { "name": "...", "tier": "Luxury", ... }
  ]
}`;
}

/**
 * generateHotelSuggestions — returns exactly 3 hotels (one per tier).
 * One Zod-failure retry included.
 */
export async function generateHotelSuggestions(
  params: HotelSuggestionsParams
): Promise<HotelsRefreshResponse['hotels']> {
  const rawText = await withExponentialBackoff(
    () => callGemini(buildHotelsPrompt(params, false)),
    'Gemini-Hotels'
  );

  let parsed: unknown;
  try { parsed = JSON.parse(rawText); }
  catch {
    const retry = await withExponentialBackoff(
      () => callGemini(buildHotelsPrompt(params, true)),
      'Gemini-Hotels-Retry'
    );
    try { parsed = JSON.parse(retry); }
    catch {
      logger.error('[Gemini-Hotels] JSON parse failed on retry');
      throw aiInvalidOutputError();
    }
  }

  const v = HotelsRefreshResponseZ.safeParse(parsed);
  if (!v.success) {
    const issues = v.error.issues.map((i) => i.message).join('; ');
    logger.warn(`[Gemini-Hotels] Zod failed: ${issues} — retrying`);

    const retry = await withExponentialBackoff(
      () => callGemini(buildHotelsPrompt(params, true)),
      'Gemini-Hotels-ZodRetry'
    );
    let retryParsed: unknown;
    try { retryParsed = JSON.parse(retry); }
    catch {
      logger.error('[Gemini-Hotels] JSON parse failed on Zod-retry');
      throw aiInvalidOutputError();
    }

    const rv = HotelsRefreshResponseZ.safeParse(retryParsed);
    if (!rv.success) {
      logger.error('[Gemini-Hotels] Zod validation failed on retry — giving up');
      throw aiInvalidOutputError();
    }
    logger.info('[Gemini-Hotels] Retry validation passed ✓');
    return rv.data.hotels;
  }

  logger.info(`[Gemini-Hotels] ${v.data.hotels.length} hotels validated ✓`);
  return v.data.hotels;
}
