import express from 'express';
import {
  register,
  login,
  requestResetCode,
  verifyResetCode,
  resetPassword,
} from '../controllers/auth.controller';

const router = express.Router();

// Rutas de autenticación (ahora bajo /auth)
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/request-reset', requestResetCode);
router.post('/auth/verify-code', verifyResetCode);
router.post('/auth/reset-password', resetPassword);

export default router;