# Backend Architecture

> Deep-dive reference for the Express + TypeScript API. For a high-level overview, see the [root README](../README.md). For frontend specifics, see [FRONTEND.md](./FRONTEND.md).

---

## 1. Layered Architecture

```
HTTP Request
      │
      ▼
┌──────────────┐
│  Routes      │  Declares endpoints, applies middleware (requireAuth)
│  auth.routes │  src/routes/auth.routes.ts
│  trip.routes │  src/routes/trip.routes.ts
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Controllers  │  Parses request, calls service, writes response
│ auth.ctrl    │  src/controllers/auth.controller.ts
│ trip.ctrl    │  src/controllers/trip.controller.ts
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Services    │  Business logic, external API calls, no HTTP concerns
│ gemini.svc   │  src/services/gemini.service.ts
│ risk.svc     │  src/services/risk.service.ts
│ geocoding.sc │  src/services/geocoding.service.ts
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Models      │  Mongoose schemas, DB access
│  User        │  src/models/User.ts
│  Trip        │  src/models/Trip.ts
└──────────────┘
```

**Why this separation:**  
Controllers know about `req` and `res`. Services know nothing about HTTP — they accept plain objects and return plain objects. This means services are testable in isolation (no Express mock needed), and the controller's responsibility is as thin as: validate request shape, call service, serialize response.

`catchAsync` (in `src/utils/errors.ts`) wraps every async controller handler so that rejected promises automatically forward to Express's error handler — eliminating try/catch boilerplate from every route.

---

## 2. Full API Contract

All routes are prefixed with `/api`. JSON is the only content type. Authentication where required is via httpOnly cookie (`token`).

### Auth routes (`/api/auth`)

#### `POST /api/auth/register`
**Auth required:** No  
**Request body:**
```json
{ "name": "string", "email": "string", "password": "string (min 8 chars)" }
```
**Response `201`:**
```json
{ "user": { "_id": "string", "name": "string", "email": "string" } }
```
Sets `token` httpOnly cookie (JWT, 7-day expiry, `Secure`, `SameSite: None`).  
**Errors:** `409` email already registered, `400` validation failure.

---

#### `POST /api/auth/login`
**Auth required:** No  
**Request body:**
```json
{ "email": "string", "password": "string" }
```
**Response `200`:**
```json
{ "user": { "_id": "string", "name": "string", "email": "string" } }
```
Sets `token` httpOnly cookie.  
**Errors:** `401` invalid credentials.

---

#### `POST /api/auth/logout`
**Auth required:** No (cookie cleared regardless)  
**Response `200`:**
```json
{ "message": "Logged out successfully" }
```
Clears the `token` cookie by setting `maxAge: 0`.

---

#### `GET /api/auth/me`
**Auth required:** Yes  
**Response `200`:**
```json
{ "user": { "_id": "string", "name": "string", "email": "string" } }
```
**Errors:** `401` if cookie is missing or JWT is expired/invalid.

---

### Trip routes (`/api/trips`)

All trip routes require authentication (`router.use(requireAuth)` applied to the entire router).

#### `POST /api/trips`
Creates a trip and triggers Gemini generation.  
**Request body:**
```json
{
  "destination": "string",
  "durationDays": "number (1–30)",
  "budgetTier": "Low | Medium | High",
  "interests": ["string"],
  "startDate": "ISO date string | null (optional)"
}
```
**Response `201`:** Full `Trip` document (see schema below).  
The controller calls `generateItinerary()` → `generateHotelSuggestions()` → `generateBudgetEstimate()` in sequence, then geocodes the destination via the Nominatim service, saves the trip, and returns it. Generation typically takes 8–18 seconds.

---

#### `GET /api/trips`
Returns all trips for the authenticated user, sorted by `createdAt` descending.  
**Response `200`:** `{ "trips": Trip[] }`

---

#### `GET /api/trips/:id`
Returns a single trip by ID.  
**Response `200`:** `{ "trip": Trip }`  
**Errors:** `404` not found, `403` trip belongs to a different user.

---

#### `DELETE /api/trips/:id`
**Response `200`:** `{ "message": "Trip deleted successfully" }`  
**Errors:** `404`, `403`.

---

#### `POST /api/trips/:id/days/:dayNumber/activities`
Adds a custom activity to a specific day.  
**Request body:**
```json
{
  "title": "string",
  "description": "string",
  "estimatedCostUSD": "number",
  "timeOfDay": "Morning | Afternoon | Evening"
}
```
**Response `200`:** Updated `Trip`.

---

#### `DELETE /api/trips/:id/days/:dayNumber/activities/:activityId`
Removes an activity from a day by its MongoDB `_id`.  
**Response `200`:** Updated `Trip`.

---

#### `POST /api/trips/:id/days/:dayNumber/regenerate`
Regenerates all activities for a specific day via Gemini.  
**Request body (optional):**
```json
{ "userFeedback": "string", "riskContext": "string" }
```
If `riskContext` is provided (and no `userFeedback`), a targeted risk-fix prompt is used that instructs Gemini to choose venues that structurally resolve the flagged issue.  
**Response `200`:** Updated `Trip`.

---

#### `POST /api/trips/:id/budget/refresh`
Re-estimates the trip budget via Gemini. Pins `activities` cost to the current sum of `estimatedCostUSD` across all activities.  
**Response `200`:** `{ "estimatedBudget": EstimatedBudget }`

---

#### `POST /api/trips/:id/hotels`
Regenerates hotel recommendations for the trip via Gemini (exactly 3, one per tier).  
**Response `200`:** `{ "hotels": Hotel[] }`

---

#### `POST /api/trips/:id/risk`
Runs the three-algorithm risk pass and writes results to the trip document.  
**Response `200`:** `{ "confidenceScore": number, "riskFlags": RiskFlag[] }`

---

### Trip document shape

```typescript
{
  _id: string,
  userId: string,
  destination: string,
  startDate: string | null,
  durationDays: number,
  budgetTier: "Low" | "Medium" | "High",
  interests: string[],
  destinationLat?: number,
  destinationLng?: number,
  itinerary: [{
    dayNumber: number,
    activities: [{
      _id: string,
      title: string,
      description: string,
      estimatedCostUSD: number,
      timeOfDay: "Morning" | "Afternoon" | "Evening",
      lat?: number,
      lng?: number
    }]
  }],
  hotels: [{
    _id: string,
    name: string,
    tier: "Budget" | "Mid-Range" | "Luxury",
    pricePerNightUSD: number,
    description: string,
    rating?: number
  }],
  estimatedBudget: {
    transport: number,
    accommodation: number,
    food: number,
    activities: number,
    total: number
  },
  confidenceScore: number,  // 0–100, default 100
  riskFlags: [{
    _id: string,
    type: "pacing" | "budget" | "weather",
    severity: "low" | "medium" | "high",
    dayNumber: number | null,   // null = trip-level flag
    message: string,
    suggestedFix: string
  }],
  status: "draft" | "generating" | "ready" | "error",
  createdAt: string,
  updatedAt: string
}
```

---

## 3. Auth Design

### httpOnly cookies, not localStorage

The JWT session token is transported in an httpOnly cookie, not localStorage. The key properties of the cookie set by `login` and `register`:

```typescript
res.cookie('token', token, {
  httpOnly: true,       // JavaScript cannot read this — XSS resistant
  secure: true,         // Only sent over HTTPS
  sameSite: 'none',     // Required for cross-origin requests
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
});
```

**Why httpOnly, not localStorage:**  
Any JavaScript on the page can read `localStorage` — including injected scripts from XSS attacks. An httpOnly cookie is invisible to JavaScript entirely; the browser attaches it to every matching request automatically. This eliminates the entire class of token-theft via XSS.

**The `SameSite: None` / `Secure` cross-origin fix (Phase 8):**  
The frontend (Vercel, `https://ai-travel-planner.vercel.app`) and the backend (Render, `https://ai-travel-planner-api.onrender.com`) are on different origins. Browsers only send cookies cross-origin when:
1. The cookie has `SameSite: None` (it's explicitly opt-ing into cross-site sending), AND
2. The cookie has `Secure: true` (it only travels over HTTPS), AND
3. The request uses `credentials: 'include'` on the fetch call.

The original development setup used `SameSite: Lax` — correct for same-origin, but it silently dropped the cookie on every cross-origin request. Symptoms: login appeared to succeed (the server set the cookie), but every subsequent authenticated request returned 401. The fix was setting `sameSite: 'none'` on all auth cookie writes and `secure: true`.

The frontend API client (`src/lib/api.ts`) sets `credentials: 'include'` on every `fetch` call, which is required for the browser to attach the cookie.

**Why the reference guide's localStorage approach was rejected:**  
The assessment reference used `Authorization: Bearer <token>` with localStorage. This pattern is common but has one structural problem: any `<script>` tag — from a CDN that gets compromised, from a third-party analytics library, from a reflected XSS in a user-generated content field — can call `localStorage.getItem('token')` and exfiltrate the session. The httpOnly cookie pattern closes that attack surface entirely at the cost of slightly more setup (`credentials: 'include'`, `SameSite: None`).

### `requireAuth` middleware

```typescript
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.token as string | undefined;
  if (!token) { res.status(401)...; return; }

  const decoded = jwt.verify(token, secret) as JwtPayload;
  req.user = { id: decoded.id, email: decoded.email };
  next();
};
```

The middleware reads `req.cookies.token` (populated by `cookie-parser`), verifies against `JWT_SECRET`, and attaches `{ id, email }` to `req.user` for downstream controllers. It returns `401` uniformly for all failure modes (missing, expired, invalid signature) — the client only needs to know "log in," not the specific reason.

---

## 4. Gemini Integration

### Model selection

```typescript
const PRIMARY_MODEL = 'gemini-2.5-flash-preview-05-20';
const FALLBACK_MODEL = 'gemini-2.5-flash';
```

The service tries the primary (preview) model first. If it gets a `not found`, `404`, or `unavailable` error, it falls through to the stable `gemini-2.5-flash`. This keeps the app functional when Gemini preview endpoints are temporarily unavailable, without requiring a manual config change.

`responseMimeType: 'application/json'` is set on every call. This activates Gemini's JSON mode, which constrains the output to valid JSON and dramatically reduces hallucinated markdown fences or explanation text wrapping the JSON.

### Exponential backoff

```typescript
const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]; // 5 retries max
```

The `withExponentialBackoff` wrapper retries any error up to 5 times with delays of 1s → 2s → 4s → 8s → 16s (total maximum wait: 31 seconds before the final attempt). Non-retryable errors (bad API key, safety filter block, invalid argument) abort immediately without retry.

In practice: a transient 503 from Gemini on attempt 1 retries after 1 second. A second failure retries after 2 seconds. Normal Gemini latency is 3–8 seconds per generation, so retries are rare in production.

### Zod validation layer

Every Gemini response is validated with Zod before any database write. Example (full itinerary):

```typescript
const ActivityZ = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedCostUSD: z.number().min(0),
  timeOfDay: z.enum(['Morning', 'Afternoon', 'Evening']),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const TripGenerationResponseZ = z.object({
  itinerary: z.array(ItineraryDayZ).min(1),
  hotels: z.array(HotelZ).min(1).max(3),
  estimatedBudget: EstimatedBudgetZ,
});
```

If Zod validation fails, the service appends `"IMPORTANT: Your previous response failed JSON schema validation. Ensure all required fields are present and correctly typed."` to the prompt and retries **once**. If the retry also fails Zod, an `AppError` with status `502` is thrown. This means the database never receives a malformed document.

---

## 5. Database Schema (Mongoose)

### `User` model

| Field | Type | Constraints |
|---|---|---|
| `email` | String | Required, unique, lowercase, regex validated |
| `name` | String | Required, 2–50 chars |
| `passwordHash` | String | Required, `select: false` (never serialized) |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

`select: false` on `passwordHash` means it is excluded from all find queries by default. The `toJSON` transform additionally deletes it and `__v` from any object that does reach serialization — belt and suspenders.

### `Trip` model

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId (ref: User) | Indexed — the primary query key |
| `destination` | String | max 100 chars |
| `startDate` | Date | Nullable |
| `durationDays` | Number | 1–30 |
| `budgetTier` | Enum: Low/Medium/High | |
| `interests` | [String] | Free-form tags |
| `destinationLat`, `destinationLng` | Number | From Nominatim geocoding |
| `itinerary` | [ItineraryDaySchema] | Sub-documents, `_id: false` (no IDs on days) |
| `hotels` | [HotelSchema] | Sub-documents, `_id: true` |
| `estimatedBudget` | EstimatedBudgetSchema | `_id: false` |
| `confidenceScore` | Number | 0–100, default 100 |
| `riskFlags` | [RiskFlagSchema] | `_id: true` |
| `status` | Enum: draft/generating/ready/error | |

**Indexing decisions:**
- `userId` has a single-field index — every trip query starts with `userId` (user can only see their own trips), so this index is used on every authenticated read.
- A compound index `{ userId: 1, createdAt: -1 }` supports the primary dashboard query (`GET /api/trips` — list all trips for a user, newest first) without a collection scan.

Activities within `ItineraryDaySchema` have `_id: true` (the default) so each activity can be addressed for the `removeActivity` endpoint.

**Per-user data isolation:**  
Every trip query in the controllers includes `{ userId: req.user.id }` as a filter condition. There is no trust that the client is sending the correct `userId` — the user ID comes from the verified JWT, not from the request body. The `getTripById` controller checks both that the trip exists and that `trip.userId.toString() === req.user.id` before returning it.

---

## 6. Error Handling Strategy

### `AppError` — structured expected errors

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
```

`isOperational = true` distinguishes expected errors (user not found, validation failure, Gemini rate limit) from unexpected crashes (null pointer, unhandled rejection). The central error middleware in `app.ts` serializes `AppError` with its `statusCode`, and logs + returns `500` for anything that isn't an `AppError`.

### `catchAsync` — async error forwarding

```typescript
export const catchAsync = (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => fn(req, res, next).catch(next);
```

Wrapping every async controller with `catchAsync` means a thrown `AppError` or rejected promise anywhere in the call stack is automatically forwarded to Express's 4-argument error handler. Without this, unhandled rejections in async routes crash the server or silently hang requests.

### Centralized error middleware

```typescript
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
});
```

All errors serialize to `{ "error": "human-readable string" }` — the client always has a `.error` field to display. Stack traces and internal details are never returned to the client.

---

## 7. Known Backend Limitations

- **Budget and hotel data is LLM-estimated, not sourced from live pricing APIs.** Gemini generates plausible USD figures based on its training data. Actual prices at the time of travel will differ — sometimes significantly for hotels (which vary by season and availability) and for flights.
- **Geocoding uses Nominatim (OpenStreetMap), not a commercial geocoding API.** Nominatim has a strict rate limit (1 request/second) and lower accuracy for non-English destination names and informal place references. If geocoding fails, `destinationLat` and `destinationLng` are left null, and the pacing risk check falls back to skipping pairs with missing coordinates.
- **Pacing risk uses straight-line haversine distance, not routing time.** A 30 km flagged distance between activities could represent 25 minutes by metro or 2 hours in traffic. The distance threshold is a proxy, not a travel time estimate.
- **Weather beyond 16 days is seasonal climatology, not a forecast.** The Open-Meteo archive API returns last year's precipitation data for the same calendar dates — a reasonable seasonal proxy but not a weather forecast. See `docs/CREATIVE_FEATURE.md` for full algorithm detail.
- **`WEATHER_MOCK=true` produces a deterministic fake flag.** This env var exists for demo reliability when the Open-Meteo API is unreachable or when a demo needs a visible weather flag regardless of actual weather. It should be disabled in production.
- **Render cold starts.** The backend is deployed on Render's free tier, which spins down after 15 minutes of inactivity. The first request after a cold start can take 20–40 seconds. This is a hosting cost decision, not an architectural one.
- **No request rate limiting.** Trip creation involves multiple Gemini API calls and is expensive. There is no per-user rate limiter on `POST /api/trips`. A burst of requests from one user could exhaust the Gemini API quota.
