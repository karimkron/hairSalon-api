import mongoose, { Schema } from 'mongoose';

const pickupSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'deleted'], // Añadido el estado 'deleted'
    default: 'pending' 
  },
  cartItemId: { type: Schema.Types.ObjectId },
}, { timestamps: true });

export default mongoose.model('Pickup', pickupSchema);