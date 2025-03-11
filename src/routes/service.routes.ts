
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  createService, 
  getServices, 
  updateService, 
  deleteService 
} from '../controllers/service.controller';
import multer from 'multer';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
});

const router = express.Router();

// Rutas protegidas
router.post(
  '/services',
  authMiddleware,
  upload.single('image'), // Campo para subir archivo
  createService
);

router.get('/services', authMiddleware, getServices);

router.put(
  '/services/:id',
  authMiddleware,
  upload.single('image'), // Campo para actualizar archivo
  updateService
);

router.delete('/services/:id', authMiddleware, deleteService);

export default router;
