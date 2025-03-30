import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { 
  getAllAppointments,
  getAppointmentsStats,
  completeAppointment
} from '../controllers/adminAppointment.controller';

const router = express.Router();

// Rutas para administradores (todas protegidas)
router.get('/admin/appointments', authMiddleware, adminMiddleware, getAllAppointments);
router.get('/admin/appointments/stats', authMiddleware, adminMiddleware, getAppointmentsStats);
router.put('/admin/appointments/:id/complete', authMiddleware, adminMiddleware, completeAppointment);

export default router;