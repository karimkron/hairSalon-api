import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
// Importar funciones del user.controller.ts en el futuro

const router = express.Router();

// Rutas de usuarios (protegidas)
// Ejemplo: router.get('/users', authMiddleware, getUsers);

export default router;