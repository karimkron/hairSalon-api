import mongoose from 'mongoose';

export interface IService {
  name: string;
  description: string;
  price: number;
  points: number;
  duration: number;  // Cambiado a number
  category: string;
  image: string; 
}

const serviceSchema = new mongoose.Schema<IService>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  points: { type: Number, required: true },
  duration: { type: Number, required: true },  // Cambiado a Number
  category: { type: String, required: true },
  image: { type: String, default: '' },
});

export const Service = mongoose.model<IService>('Service', serviceSchema);
