import mongoose, { Schema } from 'mongoose';

const cartItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 1 },
  status: { type: String, enum: ['pending', 'confirmed'], default: 'pending' },
  addedAt: { type: Date, default: Date.now }
});

const cartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [cartItemSchema]
}, { timestamps: true });

export default mongoose.model('Cart', cartSchema);