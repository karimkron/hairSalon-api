import mongoose from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  password: string;
  phone: string;
  points: number;
  role: 'user' | 'admin' | 'superadmin';
  rank: 'bronce' | 'plata' | 'oro' | 'diamante';
  isBlocked: boolean;
  isVerified: boolean; // Nuevo campo para verificación de correo
  createdAt: Date;
}

const userSchema = new mongoose.Schema<IUser>({
  name: {
    type: String,
    required: [true, 'El nombre es requerido'],
  },
  email: {
    type: String,
    required: [true, 'El email es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: 6,
  },
  phone: {
    type: String,
    required: [true, 'El teléfono es requerido'],
  },
  points: {
    type: Number,
    default: 0,
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user',
  },
  rank: {
    type: String,
    enum: ['bronce', 'plata', 'oro', 'diamante'],
    default: 'bronce',
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false, // Por defecto, el correo no está verificado
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const User = mongoose.model<IUser>('User', userSchema);