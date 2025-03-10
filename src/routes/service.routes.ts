// routes/service.routes.ts
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createService, getServices, updateService, deleteService } from '../controllers/service.controller';
import upload from '../config/multer';

const router = express.Router();

// Rutas protegidas por autenticación
router.post('/services', authMiddleware, upload.single('image'), createService);
router.get('/services', authMiddleware, getServices);
router.put('/services/:id', authMiddleware, upload.single('image'), updateService);
router.delete('/services/:id', authMiddleware, deleteService);

export default router;