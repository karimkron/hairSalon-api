import mongoose from 'mongoose';

const resetCodeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true, // Asegura que solo haya un código por email
  },
  code: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

export const ResetCode = mongoose.model('ResetCode', resetCodeSchema);