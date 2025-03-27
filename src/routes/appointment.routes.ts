import express from 'express';
import { 
  authMiddleware,
  isAppointmentOwner
} from '../middleware/auth.middleware';
import { 
  createAppointment,
  getAvailability,
  cancelAppointment,
  getUserAppointments,
  getAvailableDays,
  getUnavailableDays
} from '../controllers/appointment.controller';

const router = express.Router();

router.get('/appointments/available-days', getAvailableDays);
router.get('/appointments/unavailable-days', getUnavailableDays);
router.post('/appointments', authMiddleware, createAppointment);
router.get('/appointments/availability', getAvailability);
router.put('/appointments/:id/cancel', authMiddleware, isAppointmentOwner, cancelAppointment);
router.get('/appointments/user', authMiddleware, getUserAppointments);

export default router;