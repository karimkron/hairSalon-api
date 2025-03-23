import { Response } from 'express';
import Cart from '../models/Cart';
import Product from '../models/Product';
import { AuthRequest } from '../types/request';

export const addToCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;
    const userId = req.user?.id;
    
    const product = await Product.findById(productId);
    if (!product || product.stock < 1) {
      return res.status(400).json({ message: 'Producto sin stock' });
    }

    const cart = await Cart.findOneAndUpdate(
      { user: userId, 'items.product': productId },
      { $inc: { 'items.$.quantity': 1 } },
      { new: true, upsert: true }
    ).populate('items.product');

    res.status(200).json(cart?.items || []);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al agregar al carrito'
    });
  }
};

export const updateCartQuantity = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    
    const cart = await Cart.findOne({ 
      'items._id': itemId 
    }).populate('items.product');

    const item = cart?.items.find(i => i._id.toString() === itemId);
    if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });

    const product = await Product.findById(item.product._id);
    if (!product || product.stock < quantity) {
      return res.status(400).json({ message: 'Stock insuficiente' });
    }

    await Cart.updateOne(
      { 'items._id': itemId },
      { $set: { 'items.$.quantity': quantity } }
    );

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar cantidad'
    });
  }
};