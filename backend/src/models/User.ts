import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string; // bcryptjs hash — NEVER returned to client
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
      required: [true, 'Password is required'],
      // Never expose passwordHash in query results
      select: false,
    },
  },
  {
    timestamps: true,
    // Explicitly define the toJSON transform so passwordHash is never
    // accidentally serialized even if select:false is bypassed
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['passwordHash'];
        delete ret['__v'];
        return ret;
      },
    },
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
