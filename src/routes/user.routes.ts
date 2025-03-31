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
  getCurrentUser,
  updateCurrentUser,
  updateCurrentUserPassword, // Nuevo controlador para obtener el usuario actual
} from '../controllers/user.controller';

const router = express.Router();

router.put('/users/me', authMiddleware, updateCurrentUser);
router.put('/users/me/password', authMiddleware, updateCurrentUserPassword);

// Ruta para obtener el usuario actual (me)
router.get('/users/me', authMiddleware, getCurrentUser);

// Rutas de usuarios (protegidas)
// La ruta GET /users ahora soporta parámetros de consulta: ?page=1&limit=10&search=texto
router.get('/users', authMiddleware, superAdminMiddleware, getUsers); // Solo superadmin
router.get('/users/:id', authMiddleware, adminMiddleware, getUserById); // Superadmin y admin
router.put('/users/:id', authMiddleware, adminMiddleware, updateUser); // Superadmin y admin
router.put('/users/:id/password', authMiddleware, adminMiddleware, updatePassword); // Superadmin y admin
router.put('/users/:id/block', authMiddleware, superAdminMiddleware, toggleBlockUser); // Solo superadmin
router.delete('/users/:id', authMiddleware, superAdminMiddleware, deleteUser); // Solo superadmin

export default router;