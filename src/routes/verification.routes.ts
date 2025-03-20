import express from 'express';
import { sendVerificationEmail, verifyCode } from '../controllers/verification.controller';

const router = express.Router();

// Ruta para enviar el código de verificación
router.post('/verification/send-code', sendVerificationEmail);

// Ruta para verificar el código
router.post('/verification/verify-code', verifyCode);

export default router;