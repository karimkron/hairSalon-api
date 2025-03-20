import express from 'express';
import { registerUser } from '../controllers/userAuth.controller';

const router = express.Router();

// Ruta específica para registro de usuarios normales
router.post('/auth/register-user', registerUser);

export default router;