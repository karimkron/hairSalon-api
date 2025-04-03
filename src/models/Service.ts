import mongoose from 'mongoose';

export interface IService {
  name: string;
  description: string;
  price: number;
  points: number;
  duration: number;
  categories: string[];  // Cambiado de category (string) a categories (array)
  image: string; 
}

const serviceSchema = new mongoose.Schema<IService>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  points: { type: Number, required: true },
  duration: { type: Number, required: true },
  categories: [{ type: String }],  // Cambiado a array de strings
  image: { type: String, default: '' },
});

export const Service = mongoose.model<IService>('Service', serviceSchema);