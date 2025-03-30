import express, { Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import Cart from '../models/Cart';
import Product from '../models/Product';
import { AuthRequest } from '../types/request';
import Pickup from '../models/Pickup';
 
const router = express.Router();

// Obtener carrito - Corregir populate
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user?.id });
    
    if (!cart) return res.status(200).json([]);
     
    // Utilizamos populate con string en lugar de referencia directa
    const populatedCart = await Cart.findOne({ user: req.user?.id })
      .populate({
        path: 'items.product',
        select: 'name price stock mainImage brand description',
        model: 'Product' // Usar string en lugar de referencia
      });
    
    if (!populatedCart) return res.status(200).json([]);
    
    // Verificar estructura de los productos y devolver solo ítems válidos
    const validItems = populatedCart.items.filter(item => {
      return item.product && 
             typeof item.product === 'object' && 
             'stock' in item.product;
    });

    res.status(200).json(validItems);
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ 
      message: 'Error al obtener el carrito',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

// Agregar al carrito
router.post('/add', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;
    const userId = req.user?.id;

    let cart = await Cart.findOne({ user: userId }).populate('items.product');
    
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(item => 
      (item.product as any)._id.toString() === productId
    );

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      const product = await Product.findById(productId);
      if (!product) throw new Error('Producto no encontrado');
      
      cart.items.push({
        product: productId,
        quantity: 1,
        status: 'pending'
      });
    }

    await cart.save();
    const updatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price stock mainImage brand description',
        model: 'Product'
      })
      .lean();

    res.status(200).json(updatedCart?.items || []);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ message: 'Error al agregar al carrito' });
  }
});

// Eliminar item del carrito
router.delete('/remove/:itemId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Buscar si existe una entrada en Pickup para este ítem
    const pickup = await Pickup.findOne({ cartItemId: req.params.itemId });
    
    // Si existe, actualizar su estado a 'deleted'
    if (pickup) {
      pickup.status = 'deleted';
      await pickup.save();
    }

    // Eliminar el ítem del carrito como ya se hacía
    const updatedCart = await Cart.findOneAndUpdate(
      { user: req.user?.id },
      { $pull: { items: { _id: req.params.itemId } } },
      { new: true }
    ).populate('items.product');
    
    res.json({
      items: updatedCart?.items || [],
      wasPickupPending: pickup && pickup.status === 'deleted'
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ message: 'Error al eliminar del carrito' });
  }
});

// Actualizar cantidad
router.put('/update/:itemId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { quantity } = req.body;
    
    const cart = await Cart.findOne({ 
      user: req.user?.id,
      'items._id': req.params.itemId 
    }).populate({
      path: 'items.product',
      select: 'stock',
      model: 'Product'
    });

    if (!cart) return res.status(404).json({ message: 'Carrito no encontrado' });
    
    const item = cart.items.find(i => i._id.toString() === req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });

    const product = item.product as any;
    if (product.stock < quantity) {
      return res.status(400).json({ message: 'Stock insuficiente' });
    }

    await Cart.updateOne(
      { 'items._id': req.params.itemId },
      { $set: { 'items.$.quantity': quantity } }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar cantidad' });
  }
});

// Confirmar recogida
router.put('/confirm/:itemId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cart = await Cart.findOne({ 
      user: req.user?.id,
      'items._id': req.params.itemId 
    }).populate({
      path: 'items.product',
      select: 'stock',
      model: 'Product'
    });

    if (!cart) return res.status(404).json({ message: 'Carrito no encontrado' });

    const item = cart.items.find(i => i._id.toString() === req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });

    const product = await Product.findById((item.product as any)._id);
    if (!product) {
      return res.status(400).json({ message: 'Producto no encontrado' });
    }

    // Verificar que hay suficiente stock (solo verificación, no reducción)
    if (product.stock < item.quantity) {
      return res.status(400).json({ message: 'Stock insuficiente' });
    }

    // Crear un nuevo registro en la colección Pickup
    const pickup = new Pickup({
      user: req.user?.id,
      product: (item.product as any)._id,
      quantity: item.quantity,
      cartItemId: item._id
    });
    
    await pickup.save();

    // Actualizar el estado del ítem en el carrito a 'confirmed'
    await Cart.updateOne(
      { 'items._id': req.params.itemId },
      { $set: { 'items.$.status': 'confirmed' } }
    );

    res.status(200).json({ 
      success: true,
      message: 'Recoge tu pedido en el local en tu próxima visita' 
    });
  } catch (error) {
    console.error('Error confirming pickup:', error);
    res.status(500).json({ message: 'Error al confirmar recogida' });
  }
});


// Confirmar todos los ítems
router.post('/confirm-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user?.id }).populate({
      path: 'items.product',
      select: 'stock',
      model: 'Product'
    });

    if (!cart || cart.items.length === 0) {
      return res.status(200).json({ success: true, message: 'No hay ítems en el carrito' });
    }

    const pendingItems = cart.items.filter(item => item.status === 'pending');
    
    for (const item of pendingItems) {
      const product = await Product.findById((item.product as any)._id);
      if (!product || product.stock < item.quantity) continue;

      // Crear registro en Pickup
      const pickup = new Pickup({
        user: req.user?.id,
        product: (item.product as any)._id,
        quantity: item.quantity,
        cartItemId: item._id
      });
      
      await pickup.save();

      // Actualizar estado en carrito
      await Cart.updateOne(
        { 'items._id': item._id },
        { $set: { 'items.$.status': 'confirmed' } }
      );
    }

    res.status(200).json({ 
      success: true,
      message: 'Los productos han sido confirmados para recoger' 
    });
  } catch (error) {
    console.error('Error confirming all items:', error);
    res.status(500).json({ message: 'Error al confirmar todos los ítems' });
  }
});

// Obtener pickups del usuario
router.get('/pickups', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pickups = await Pickup.find({ 
      user: req.user?.id,
      status: 'pending'
    }).populate('product');
    
    res.status(200).json(pickups);
  } catch (error) {
    console.error('Error getting pickups:', error);
    res.status(500).json({ message: 'Error al obtener pickups' });
  }
});

// Cancelar un pickup específico
router.delete('/pickups/:pickupId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pickup = await Pickup.findOneAndUpdate(
      { _id: req.params.pickupId, user: req.user?.id },
      { status: 'deleted' },
      { new: true }
    );
    
    if (!pickup) {
      return res.status(404).json({ message: 'Pickup no encontrado' });
    }
    
    // Actualizar el estado del ítem en el carrito a 'pending' si existe
    if (pickup.cartItemId) {
      await Cart.updateOne(
        { 'items._id': pickup.cartItemId },
        { $set: { 'items.$.status': 'pending' } }
      );
    }
    
    res.status(200).json({ success: true, message: 'Pickup cancelado' });
  } catch (error) {
    console.error('Error canceling pickup:', error);
    res.status(500).json({ message: 'Error al cancelar pickup' });
  }
});

// Cancelar todos los pickups del usuario
router.delete('/pickups', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pickups = await Pickup.find({ user: req.user?.id, status: 'pending' });
    
    // Actualizar todos los pickups a 'deleted'
    await Pickup.updateMany(
      { user: req.user?.id, status: 'pending' },
      { status: 'deleted' }
    );
    
    // Actualizar los ítems correspondientes en el carrito a 'pending'
    for (const pickup of pickups) {
      if (pickup.cartItemId) {
        await Cart.updateOne(
          { 'items._id': pickup.cartItemId },
          { $set: { 'items.$.status': 'pending' } }
        );
      }
    }
    
    res.status(200).json({ success: true, message: 'Todos los pickups cancelados' });
  } catch (error) {
    console.error('Error canceling all pickups:', error);
    res.status(500).json({ message: 'Error al cancelar todos los pickups' });
  }
});

export default router;