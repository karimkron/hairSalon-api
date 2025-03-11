
import mongoose from 'mongoose';

export interface IService {
  name: string;
  description: string;
  price: number;
  points: number;
  duration: string;
  category: string;
  image: string; // Campo opcional
  stock: boolean;
}

const serviceSchema = new mongoose.Schema<IService>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  points: { type: Number, required: true },
  duration: { type: String, required: true },
  category: { type: String, required: true },
  image: { type: String, default: '' }, // Cambiado a opcional
  stock: { type: Boolean, default: true },
});

export const Service = mongoose.model<IService>('Service', serviceSchema);
