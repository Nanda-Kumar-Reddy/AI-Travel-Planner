import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;

  // Password — optional because Google-only accounts have no password.
  // Enforced at controller layer: if googleId is absent, passwordHash must be present.
  // We cannot use Mongoose's built-in required:true here because that can't express
  // "required unless googleId is set" as a conditional — so we validate in code instead.
  passwordHash?: string; // bcryptjs hash — NEVER returned to client

  // ── Google OAuth ────────────────────────────────────────────────────────────
  googleId?: string;

  // ── Email verification ──────────────────────────────────────────────────────
  emailVerified: boolean;
  // Raw token is never stored — only its SHA-256 hash.
  // select:false on both so they're never included in default queries.
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    passwordHash: {
      type: String,
      // required removed — see interface comment above
      select: false, // Never expose passwordHash in query results
    },

    // ── Google OAuth ──────────────────────────────────────────────────────────
    googleId: {
      type: String,
      sparse: true, // sparse unique index: allows multiple null values (non-Google users)
      unique: true,
    },

    // ── Email verification ────────────────────────────────────────────────────
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationTokenHash: {
      type: String,
      select: false, // never leaked in query responses
    },
    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    // Explicitly define toJSON transform so sensitive fields are never
    // accidentally serialized even if select:false is bypassed
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['passwordHash'];
        delete ret['emailVerificationTokenHash'];
        delete ret['emailVerificationExpiresAt'];
        delete ret['__v'];
        return ret;
      },
    },
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
