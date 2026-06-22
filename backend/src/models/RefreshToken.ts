import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────
/**
 * IRefreshToken — one row per active session.
 * The raw token never touches the DB — only its SHA-256 hash is stored.
 *
 * Multi-device: one user can have many active RefreshToken documents
 * simultaneously (one per device/browser). Logout deletes the specific row.
 * Theft detection deletes ALL rows for a user.
 *
 * TTL index on expiresAt handles automatic cleanup — expired documents are
 * removed by MongoDB's background process without application involvement.
 */
export interface IRefreshToken extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;          // SHA-256 hex of the raw refresh token
  deviceHint: string;         // user-agent snippet — for display only, not security
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,            // fast lookup by user (for theft detection: deleteMany by userId)
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,           // one hash → one row; duplicates would be a logic bug
      select: false,          // never returned in query results unless explicitly requested
    },
    deviceHint: {
      type: String,
      default: 'unknown',
      maxlength: 200,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // TTL index: MongoDB auto-deletes expired documents
    // This keeps the collection size bounded without a cron job
  }
);

// TTL index — MongoDB removes documents 0 seconds after expiresAt
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
