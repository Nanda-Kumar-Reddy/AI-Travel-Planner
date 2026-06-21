/**
 * Gemini Service — AI itinerary generation with:
 *  - Primary model: gemini-2.5-flash-preview-09-2025
 *  - Fallback model: gemini-2.5-flash
 *  - Exponential backoff: 1s → 2s → 4s → 8s → 16s (5 retries max)
 *  - Zod validation on response before any DB write
 *  - One retry with "validation failed" prompt amendment on Zod failure
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { z } from 'zod';
import { AppError } from '../utils/errors';

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

// ─── Backoff helper ───────────────────────────────────────────────────────────

const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]; // 1s → 16s
const MAX_RETRIES = 5;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * withExponentialBackoff — retries an async operation with exponential delays.
 * Retries on any error. Logs each attempt to the console.
 *
 * @param fn         - The async function to retry
 * @param label      - Label for log output
 * @param maxRetries - Maximum number of retries (default 5)
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
        console.log(`[${label}] Retry ${attempt}/${maxRetries} — waiting ${delayMs}ms...`);
        await sleep(delayMs);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] Attempt ${attempt + 1} failed: ${msg}`);

      // Don't retry on non-retryable errors
      if (isNonRetryable(err)) {
        console.error(`[${label}] Non-retryable error — aborting`);
        break;
      }
    }
  }

  throw lastError;
}

function isNonRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Bad API key, content blocked by safety filters, invalid argument
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('invalid argument')
  );
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
  if (!apiKey) throw new AppError('GEMINI_API_KEY is not configured.', 500);
  return new GoogleGenerativeAI(apiKey);
}

async function callGemini(prompt: string): Promise<string> {
  const client = getClient();

  // Try primary model first, fall back on model-not-found errors
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
      console.log(`[Gemini] Generated response using model: ${modelName} (${text.length} chars)`);
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only fall through to the next model on model-not-found / model-unavailable
      const isModelError =
        msg.includes('not found') ||
        msg.includes('404') ||
        msg.includes('not supported') ||
        msg.includes('unavailable');

      if (!isModelError || modelName === FALLBACK_MODEL) throw err;
      console.warn(`[Gemini] Model ${modelName} failed (${msg}), trying fallback ${FALLBACK_MODEL}...`);
    }
  }

  throw new AppError('All Gemini models failed.', 502);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * generateItinerary — calls Gemini with exponential backoff, validates with Zod,
 * retries once with an amended prompt if validation fails.
 */
export async function generateItinerary(
  params: PromptParams
): Promise<TripGenerationResponse> {
  // Attempt 1: primary prompt
  const rawText = await withExponentialBackoff(
    () => callGemini(buildPrompt(params, false)),
    'Gemini'
  );

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // JSON parse failed on attempt 1 — try once more with retry prompt
    console.warn('[Gemini] JSON parse failed on attempt 1 — retrying with amended prompt');
    const retryText = await withExponentialBackoff(
      () => callGemini(buildPrompt(params, true)),
      'Gemini-Retry'
    );
    try {
      parsed = JSON.parse(retryText);
    } catch {
      throw new AppError(
        'Failed to generate a valid itinerary. Please try again.',
        502
      );
    }
  }

  // Zod validation
  const validation = TripGenerationResponseZ.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => i.message).join('; ');
    console.warn(`[Gemini] Zod validation failed: ${issues} — retrying with amended prompt`);

    // One retry with validation-failure context in the prompt
    const retryText = await withExponentialBackoff(
      () => callGemini(buildPrompt(params, true)),
      'Gemini-ZodRetry'
    );

    let retryParsed: unknown;
    try {
      retryParsed = JSON.parse(retryText);
    } catch {
      throw new AppError('Failed to generate a valid itinerary. Please try again.', 502);
    }

    const retryValidation = TripGenerationResponseZ.safeParse(retryParsed);
    if (!retryValidation.success) {
      const retryIssues = retryValidation.error.issues.map((i) => i.message).join('; ');
      console.error(`[Gemini] Zod validation failed on retry: ${retryIssues}`);
      throw new AppError('AI generated an invalid itinerary structure. Please try again.', 502);
    }

    console.log('[Gemini] Retry validation passed ✓');
    return retryValidation.data;
  }


  console.log(`[Gemini] Validation passed ✓ — ${validation.data.itinerary.length} days generated`);
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
    riskContext ? `Risk context to address: "${riskContext}"` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const retryPrefix = isRetry
    ? 'IMPORTANT: Your previous response failed schema validation. Return ONLY the JSON object with an "activities" array.\n\n'
    : '';

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
 * regenerateDayActivities — replaces one day's activities via Gemini.
 * Validates with RegenerateDayResponseZ; one Zod-failure retry.
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
    console.warn('[Gemini-Regen] JSON parse failed — retrying');
    const retryText = await withExponentialBackoff(
      () => callGemini(buildRegenerateDayPrompt(params, true)),
      'Gemini-Regen-Retry'
    );
    try { parsed = JSON.parse(retryText); }
    catch { throw new AppError('Failed to regenerate the day. Please try again.', 502); }
  }

  const validation = RegenerateDayResponseZ.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => i.message).join('; ');
    console.warn(`[Gemini-Regen] Zod failed: ${issues} — retrying`);

    const retryText = await withExponentialBackoff(
      () => callGemini(buildRegenerateDayPrompt(params, true)),
      'Gemini-Regen-ZodRetry'
    );
    let retryParsed: unknown;
    try { retryParsed = JSON.parse(retryText); }
    catch { throw new AppError('Failed to regenerate the day. Please try again.', 502); }

    const retryV = RegenerateDayResponseZ.safeParse(retryParsed);
    if (!retryV.success) throw new AppError('AI generated an invalid day structure. Please try again.', 502);
    console.log('[Gemini-Regen] Retry validation passed ✓');
    return retryV.data.activities;
  }

  console.log(`[Gemini-Regen] Validation passed ✓ — ${validation.data.activities.length} activities`);
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
 * generateBudgetEstimate — refreshes the trip budget via Gemini.
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
    catch { throw new AppError('Failed to estimate budget. Please try again.', 502); }
  }

  const v = BudgetRefreshResponseZ.safeParse(parsed);
  if (!v.success) {
    const issues = v.error.issues.map((i) => i.message).join('; ');
    console.warn(`[Gemini-Budget] Zod failed: ${issues}`);
    throw new AppError('AI returned an invalid budget structure. Please try again.', 502);
  }

  // Force-pin activities to the passed value to prevent Gemini from drifting
  v.data.activities = params.activitiesTotalCost;
  v.data.total = v.data.transport + v.data.accommodation + v.data.food + v.data.activities;

  console.log(`[Gemini-Budget] Estimate ready — total $${v.data.total}`);
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
 * generateHotelSuggestions — returns exactly 3 hotels (one per tier) via Gemini.
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
    catch { throw new AppError('Failed to generate hotel suggestions. Please try again.', 502); }
  }

  const v = HotelsRefreshResponseZ.safeParse(parsed);
  if (!v.success) {
    const issues = v.error.issues.map((i) => i.message).join('; ');
    console.warn(`[Gemini-Hotels] Zod failed: ${issues} — retrying`);

    const retry = await withExponentialBackoff(
      () => callGemini(buildHotelsPrompt(params, true)),
      'Gemini-Hotels-ZodRetry'
    );
    let retryParsed: unknown;
    try { retryParsed = JSON.parse(retry); }
    catch { throw new AppError('Failed to generate hotel suggestions. Please try again.', 502); }

    const rv = HotelsRefreshResponseZ.safeParse(retryParsed);
    if (!rv.success) throw new AppError('AI returned invalid hotel data. Please try again.', 502);
    console.log('[Gemini-Hotels] Retry validation passed ✓');
    return rv.data.hotels;
  }

  console.log(`[Gemini-Hotels] ${v.data.hotels.length} hotels validated ✓`);
  return v.data.hotels;
}
