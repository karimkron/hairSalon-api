import express from 'express';
import {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  deleteImage,
} from '../controllers/product.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import multer from 'multer';
import Product from '../models/Product'; // Importar el modelo Product

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
});

const router = express.Router();

router.post('/products', authMiddleware, upload.array('images', 10), createProduct);
router.get('/products', authMiddleware, getProducts);
router.put('/products/:id', authMiddleware, upload.array('images', 10), updateProduct);
router.delete('/products/:id', authMiddleware, deleteProduct);
router.delete('/products/:id/images/:imageIndex', authMiddleware, deleteImage);

// Obtener todas las categorías de productos
router.get('/products/categories', authMiddleware, async (req, res) => {
  try {
    const categories = await Product.distinct("categories"); // Obtener todas las categorías únicas
    res.status(200).json(categories);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener categorías',
    });
  }
});

// Agregar una nueva categoría
router.post('/products/categories', authMiddleware, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ message: 'Categoría requerida' });
    }

    // Verificar si la categoría ya existe
    const existingCategory = await Product.findOne({ categories: category });
    if (existingCategory) {
      return res.status(400).json({ message: 'La categoría ya existe' });
    }

    // Agregar la categoría a un producto temporal (o a la colección de categorías si tienes una)
    await Product.updateMany({}, { $addToSet: { categories: category } });

    res.status(201).json({ category });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al agregar categoría',
    });
  }
});

export default router;