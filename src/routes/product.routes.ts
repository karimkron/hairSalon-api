import express from 'express';
import { 
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct
} from '../controllers/product.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import multer from 'multer';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10MB
});

const router = express.Router();

router.post('/products', authMiddleware, upload.single('image'), createProduct);
router.get('/products', authMiddleware, getProducts);
router.put('/products/:id', authMiddleware, upload.single('image'), updateProduct);
router.delete('/products/:id', authMiddleware, deleteProduct);

export default router;