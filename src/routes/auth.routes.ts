import express from 'express';
import {
  register,
  login,
  requestResetCode,
  verifyResetCode,
  resetPassword,
  registerAdmin,
  
} from '../controllers/auth.controller';

const router = express.Router();

// Rutas de autenticación
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/forgot-password', requestResetCode);
router.post('/auth/verify-code', verifyResetCode);
router.post('/auth/reset-password', resetPassword);


// Ruta para registrar un administrador
router.post('/auth/register-admin', registerAdmin);

export default router;