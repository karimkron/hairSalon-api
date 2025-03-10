// models/Service.ts
import mongoose from 'mongoose';

export interface IService {
  name: string;
  description: string;
  price: number;
  points: number;
  duration: string;
  category: string;
  image: string; // Ruta de la imagen
  stock: boolean;
}

const serviceSchema = new mongoose.Schema<IService>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  points: { type: Number, required: true },
  duration: { type: String, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true }, // Ruta de la imagen
  stock: { type: Boolean, default: true },
});

export const Service = mongoose.model<IService>('Service', serviceSchema);