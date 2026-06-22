// ─── Primitive Enums ────────────────────────────────────────────────────────

export type BudgetTier = 'Low' | 'Medium' | 'High';
export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening';
export type RiskType = 'pacing' | 'budget' | 'weather';
export type RiskSeverity = 'low' | 'medium' | 'high';
export type TripStatus = 'draft' | 'generating' | 'ready' | 'error';
export type HotelTier = 'Budget' | 'Mid-Range' | 'Luxury';

// ─── Sub-document Types ──────────────────────────────────────────────────────

export interface Activity {
  _id?: string;
  title: string;
  description: string;
  estimatedCostUSD: number;
  timeOfDay: TimeOfDay;
  lat?: number; // approximate geocoordinate returned by Gemini
  lng?: number; // approximate geocoordinate returned by Gemini
}

export interface ItineraryDay {
  dayNumber: number;
  activities: Activity[];
}

export interface Hotel {
  name: string;
  tier: HotelTier;
  pricePerNightUSD: number;
  description: string;
  rating?: number; // 1.0–5.0
}

export interface EstimatedBudget {
  transport: number;
  accommodation: number;
  food: number;
  activities: number;
  total: number;
}

export interface RiskFlag {
  _id?: string;
  type: RiskType;
  severity: RiskSeverity;
  dayNumber: number | null; // null = trip-level flag (e.g. overall budget)
  message: string;
  suggestedFix: string;
}

// ─── Day Diff (returned by regenerate-day to power animated before/after) ────

export interface DayDiff {
  dayNumber: number;
  before: Activity[];
  after: Activity[];
  changedActivityIds: string[]; // IDs of new/replaced activities for highlighting
}

// ─── Core Domain Models ───────────────────────────────────────────────────────

export interface Trip {
  _id: string;
  userId: string;
  destination: string;
  startDate?: string | null; // ISO date string — optional; used for weather forecast vs climatology
  durationDays: number;
  budgetTier: BudgetTier;
  interests: string[];
  destinationLat?: number; // city-level coordinate from Open-Meteo geocoding at creation
  destinationLng?: number; // city-level coordinate from Open-Meteo geocoding at creation
  itinerary: ItineraryDay[];
  hotels: Hotel[];
  estimatedBudget: EstimatedBudget;
  confidenceScore: number; // 0–100; updated after each risk pass
  riskFlags: RiskFlag[];
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  emailVerified?: boolean;   // Phase 11: false until email link is clicked
  googleId?: string;          // Phase 11: set for Google OAuth users
  createdAt: string;
}

// ─── API Request / Response Shapes ───────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

// Phase 11: registration returns a message, not a user+cookie
export interface RegisterResponse {
  message: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
}

// Phase 11: Google sign-in sends the ID token from GIS
export interface GoogleAuthRequest {
  idToken: string;
}

export interface CreateTripRequest {
  destination: string;
  startDate?: string | null; // ISO date string (optional)
  durationDays: number;
  budgetTier: BudgetTier;
  interests: string[];
}

export interface RegenerateDayRequest {
  userFeedback?: string;
  riskContext?: string; // injected by the one-click fix flow
}

export interface AddActivityRequest {
  title: string;
  description?: string;
  estimatedCostUSD?: number;
  timeOfDay?: TimeOfDay;
}

export interface ApiError {
  error: string;
  code?: string;
}
