import express from 'express';
import {
  login,
  requestResetCode,
  verifyResetCode,
  resetPassword,
} from '../controllers/auth.controller';
import verificationRoutes from './verification.routes';

const router = express.Router();

// Rutas comunes de autenticación (para usuarios)
router.post('/auth/login', login); // Login para usuarios
router.post('/auth/forgot-password', requestResetCode);
router.post('/auth/verify-code', verifyResetCode);
router.post('/auth/reset-password', resetPassword);
router.use('/auth', verificationRoutes); // Rutas de verificación

export default router;