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
} from '../controllers/user.controller';

const router = express.Router();

// Rutas de usuarios (protegidas)
router.get('/users', authMiddleware, superAdminMiddleware, getUsers); // Solo superadmin
router.get('/users/:id', authMiddleware, adminMiddleware, getUserById); // Superadmin y admin
router.put('/users/:id', authMiddleware, adminMiddleware, updateUser); // Superadmin y admin
router.put('/users/:id/password', authMiddleware, adminMiddleware, updatePassword); // Superadmin y admin
router.put('/users/:id/block', authMiddleware, superAdminMiddleware, toggleBlockUser); // Solo superadmin
router.delete('/users/:id', authMiddleware, superAdminMiddleware, deleteUser); // Solo superadmin

export default router;