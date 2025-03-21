import mongoose, { Schema } from 'mongoose';

const productSchema = new Schema({
  name: { type: String, required: true },
  brand: String,
  description: String,
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  available: { type: Boolean, default: true },
  images: [{ type: String }], // Array de URLs de imágenes
  mainImage: { type: String }, // URL de la imagen principal
  categories: [{ type: String }], // Nuevo campo para categorías
}, { timestamps: true });

export default mongoose.model('Product', productSchema);