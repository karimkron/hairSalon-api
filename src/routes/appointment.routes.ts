import express from 'express';
import { 
  authMiddleware, 
  isAppointmentOwner, 
  adminMiddleware 
} from '../middleware/auth.middleware';
import { 
  createAppointment, 
  cancelAppointment, 
  getUserAppointments,
  getAppointmentDetails,
  rescheduleAppointment,
  notifyScheduleChange
} from '../controllers/appointment.controller';

const router = express.Router();

// Rutas para usuarios normales
router.post('/appointments', authMiddleware, createAppointment);
router.get('/appointments/user', authMiddleware, getUserAppointments);
router.get('/appointments/:id', authMiddleware, isAppointmentOwner, getAppointmentDetails);
router.put('/appointments/:id/cancel', authMiddleware, isAppointmentOwner, cancelAppointment);
router.put('/appointments/:id/reschedule', authMiddleware, isAppointmentOwner, rescheduleAppointment);

// Rutas admin para gestión de citas
router.post('/appointments/notify-schedule-change', authMiddleware, adminMiddleware, notifyScheduleChange);

export default router;