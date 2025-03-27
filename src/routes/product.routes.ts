import express from "express";
import {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  deleteImage,
} from "../controllers/product.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import multer from "multer";
import Product from "../models/Product"; // Importar el modelo Product

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
});

const router = express.Router();

// Rutas específicas primero
router.get("/products", getProducts);
router.post("/products", authMiddleware, upload.array("images", 10), createProduct);
router.put("/products/:id", authMiddleware, upload.array("images", 10), updateProduct);
router.delete("/products/:id", authMiddleware, deleteProduct);
router.delete("/products/:id/images/:imageIndex", authMiddleware, deleteImage);

// Rutas para categorías
router.get("/products/categories", async (req, res) => {
  try {
    const categories = await Product.distinct("categories"); // Obtener todas las categorías únicas
    res.status(200).json(categories);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener categorías",
    });
  }
});

router.post("/products/categories", authMiddleware, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ message: "Categoría requerida" });
    }

    // Verificar si la categoría ya existe
    const existingCategory = await Product.findOne({ categories: category });
    if (existingCategory) {
      return res.status(400).json({ message: "La categoría ya existe" });
    }

    // No actualizar ningún producto, simplemente retornar la nueva categoría
    res.status(201).json({ category });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al agregar categoría",
    });
  }
});

// Ruta para bulk
router.post('/products/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    const products = await Product.find({ _id: { $in: ids } })
      .select('name price stock mainImage brand description');
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// Ruta para obtener producto por id - HACERLA MÁS ESPECÍFICA
router.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Producto no encontrado" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el producto" });
  }
});

export default router;