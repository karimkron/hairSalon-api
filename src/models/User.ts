import mongoose from 'mongoose';

// Definimos la interfaz para el usuario
export interface IUser {
  name: string;
  email: string;
  password: string;
  phone: string;
  points: number;
  role: string;
  createdAt: Date;
}

// Creamos el esquema de MongoDB
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Creamos el modelo a partir del esquema
export const User = mongoose.model<IUser>('User', userSchema);