import express from 'express';
import { registerAdmin, login } from '../controllers/auth.controller';


const router = express.Router();

// Ruta específica para registro de administradores (protegida)
router.post('/admin/login', login); // Login para administradores
router.post('/auth/register-admin', registerAdmin);

export default router;