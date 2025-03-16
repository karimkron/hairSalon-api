import mongoose, { Schema } from 'mongoose';

const productSchema = new Schema({
  name: { type: String, required: true },
  brand: String,
  description: String,
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  available: { type: Boolean, default: true },
  image: String,
}, { timestamps: true });

export default mongoose.model('Product', productSchema);