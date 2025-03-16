import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getUsers,
  getUserById,
  updateUser,
  updatePassword,
  toggleBlockUser,
  deleteUser,
} from '../controllers/user.controller';

const router = express.Router();

// Rutas de usuarios (protegidas)
router.get('/users', authMiddleware, getUsers); // Solo superadmin
router.get('/users/:id', authMiddleware, getUserById); // Superadmin y admin
router.put('/users/:id', authMiddleware, updateUser); // Superadmin y admin
router.put('/users/:id/password', authMiddleware, updatePassword); // Superadmin y admin
router.put('/users/:id/block', authMiddleware, toggleBlockUser); // Solo superadmin
router.delete('/users/:id', authMiddleware, deleteUser); // Solo superadmin

export default router;