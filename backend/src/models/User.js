import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    // optional: default city for location filtering later
    defaultCity: { type: String, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model('User', UserSchema);
