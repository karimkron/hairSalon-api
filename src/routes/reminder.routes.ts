import express from 'express';
import { authMiddleware, adminMiddleware, isAppointmentOwner } from '../middleware/auth.middleware';
import { 
  sendAppointmentReminders, 
  markCompletedAppointments,
  toggleAppointmentReminder,
  sendManualReminder
} from '../controllers/reminder.controller';

const router = express.Router();

// Rutas para usuarios normales
router.put('/reminders/appointments/:id/toggle', authMiddleware, isAppointmentOwner, toggleAppointmentReminder);

// Rutas para administradores
router.post('/reminders/send-daily', authMiddleware, adminMiddleware, sendAppointmentReminders);
router.post('/reminders/mark-completed', authMiddleware, adminMiddleware, markCompletedAppointments);
router.post('/reminders/appointments/:id/send', authMiddleware, adminMiddleware, sendManualReminder);

export default router;