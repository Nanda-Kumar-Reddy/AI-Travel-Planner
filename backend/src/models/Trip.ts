import mongoose, { Document, Schema } from 'mongoose';

// ─── Sub-document Schemas ────────────────────────────────────────────────────

const ActivitySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    estimatedCostUSD: { type: Number, required: true, min: 0 },
    timeOfDay: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening'],
      required: true,
    },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: true }
);

const ItineraryDaySchema = new Schema(
  {
    dayNumber: { type: Number, required: true, min: 1 },
    activities: { type: [ActivitySchema], default: [] },
  },
  { _id: false }
);

const HotelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    tier: {
      type: String,
      enum: ['Budget', 'Mid-Range', 'Luxury'],
      required: true,
    },
    pricePerNightUSD: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    rating: { type: Number, min: 1.0, max: 5.0 },
  },
  { _id: true }
);

const EstimatedBudgetSchema = new Schema(
  {
    transport: { type: Number, required: true, min: 0 },
    accommodation: { type: Number, required: true, min: 0 },
    food: { type: Number, required: true, min: 0 },
    activities: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const RiskFlagSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['pacing', 'budget', 'weather'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true,
    },
    dayNumber: { type: Number, default: null }, // null = trip-level flag
    message: { type: String, required: true },
    suggestedFix: { type: String, required: true },
  },
  { _id: true }
);

// ─── ITrip Interface ─────────────────────────────────────────────────────────

export interface IActivity {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  estimatedCostUSD: number;
  timeOfDay: 'Morning' | 'Afternoon' | 'Evening';
  lat?: number;
  lng?: number;
}

export interface IItineraryDay {
  dayNumber: number;
  activities: IActivity[];
}

export interface IHotel {
  _id: mongoose.Types.ObjectId;
  name: string;
  tier: 'Budget' | 'Mid-Range' | 'Luxury';
  pricePerNightUSD: number;
  description: string;
  rating?: number;
}

export interface IEstimatedBudget {
  transport: number;
  accommodation: number;
  food: number;
  activities: number;
  total: number;
}

export interface IRiskFlag {
  _id: mongoose.Types.ObjectId;
  type: 'pacing' | 'budget' | 'weather';
  severity: 'low' | 'medium' | 'high';
  dayNumber: number | null;
  message: string;
  suggestedFix: string;
}

export interface ITrip extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  destination: string;
  startDate?: Date | null;
  durationDays: number;
  budgetTier: 'Low' | 'Medium' | 'High';
  interests: string[];
  destinationLat?: number;
  destinationLng?: number;
  itinerary: IItineraryDay[];
  hotels: IHotel[];
  estimatedBudget: IEstimatedBudget;
  confidenceScore: number;
  riskFlags: IRiskFlag[];
  status: 'draft' | 'generating' | 'ready' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

// ─── Trip Schema ─────────────────────────────────────────────────────────────

const TripSchema = new Schema<ITrip>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // fast lookup for GET /api/trips scoped to user
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
      maxlength: [100, 'Destination cannot exceed 100 characters'],
    },
    startDate: {
      type: Date,
      default: null,
    },
    durationDays: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1 day'],
      max: [30, 'Duration cannot exceed 30 days'],
    },
    budgetTier: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      required: [true, 'Budget tier is required'],
    },
    interests: {
      type: [String],
      default: [],
    },
    destinationLat: { type: Number },
    destinationLng: { type: Number },
    itinerary: { type: [ItineraryDaySchema], default: [] },
    hotels: { type: [HotelSchema], default: [] },
    estimatedBudget: {
      type: EstimatedBudgetSchema,
      default: () => ({ transport: 0, accommodation: 0, food: 0, activities: 0, total: 0 }),
    },
    confidenceScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    riskFlags: { type: [RiskFlagSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'generating', 'ready', 'error'],
      default: 'draft',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Compound index: userId + createdAt descending (for paginated trip list)
TripSchema.index({ userId: 1, createdAt: -1 });

export const Trip = mongoose.model<ITrip>('Trip', TripSchema);
