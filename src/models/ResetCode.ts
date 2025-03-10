import mongoose from 'mongoose';

const resetCodeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
});

export const ResetCode = mongoose.model('ResetCode', resetCodeSchema);