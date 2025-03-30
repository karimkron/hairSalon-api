import express from 'express';
import { 
  authMiddleware,
  adminMiddleware,
  superAdminMiddleware
} from '../middleware/auth.middleware';
import {
  getUsers,
  getUserById,
  updateUser,
  updatePassword,
  toggleBlockUser,
  deleteUser,
  getCurrentUser, // Nuevo controlador para obtener el usuario actual
} from '../controllers/user.controller';

const router = express.Router();

// Ruta para obtener el usuario actual (me)
router.get('/users/me', authMiddleware, getCurrentUser);

// Rutas de usuarios (protegidas)
router.get('/users', authMiddleware, superAdminMiddleware, getUsers); // Solo superadmin
router.get('/users/:id', authMiddleware, adminMiddleware, getUserById); // Superadmin y admin
router.put('/users/:id', authMiddleware, adminMiddleware, updateUser); // Superadmin y admin
router.put('/users/:id/password', authMiddleware, adminMiddleware, updatePassword); // Superadmin y admin
router.put('/users/:id/block', authMiddleware, superAdminMiddleware, toggleBlockUser); // Solo superadmin
router.delete('/users/:id', authMiddleware, superAdminMiddleware, deleteUser); // Solo superadmin

export default router;