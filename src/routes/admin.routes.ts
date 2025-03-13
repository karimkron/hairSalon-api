import express from 'express';
import {
  requestAdminCode,
  verifyAdminCodeController,
} from '../controllers/admin.controller';

const router = express.Router();

// Ruta para solicitar un código de administrador
router.post('/admin/request-code', requestAdminCode);

// Ruta para verificar un código de administrador
router.post('/admin/verify-code', verifyAdminCodeController);

export default router;