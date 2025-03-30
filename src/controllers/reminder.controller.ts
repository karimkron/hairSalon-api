import { Request, Response } from 'express';
import { AuthRequest } from '../types/request';
import notificationService from '../services/notification.service';
import { Appointment } from 'models/Appointment';
import { sendAppointmentReminder } from 'services/email.service';

/**
 * @description Envía recordatorios para citas del día siguiente
 * Este endpoint puede ser llamado manualmente o mediante un cron job
 */
export const sendAppointmentReminders = async (req: Request, res: Response) => {
  try {
    // Ejecutar el servicio de envío de recordatorios
    const result = await notificationService.sendAppointmentReminders();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: `Recordatorios enviados con éxito (${result.count} citas)`,
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Ocurrió un error al enviar los recordatorios'
      });
    }
  } catch (error) {
    console.error('Error en el controlador de recordatorios:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Marca citas pasadas como completadas
 * Este endpoint puede ser llamado manualmente o mediante un cron job
 */
export const markCompletedAppointments = async (req: Request, res: Response) => {
  try {
    // Ejecutar el servicio para marcar citas completadas
    const result = await notificationService.markCompletedAppointments();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: `Citas marcadas como completadas (${result.count} actualizadas)`,
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Ocurrió un error al actualizar las citas'
      });
    }
  } catch (error) {
    console.error('Error marcando citas como completadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Activa o desactiva recordatorios para una cita específica
 * Permite a los usuarios configurar si quieren recibir recordatorios para una cita
 */
export const toggleAppointmentReminder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'El parámetro "enabled" debe ser un valor booleano'
      });
    }
    
    // Buscar la cita y verificar permisos
    const appointment = await Appointment.findById(id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada'
      });
    }
    
    // Verificar si el usuario es el propietario de la cita
    if (appointment.user.toString() !== req.user?.id) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para modificar esta cita'
      });
    }
    
    // Actualizar la preferencia de recordatorio
    appointment.reminderSent = !enabled; // Si enabled=false, marcamos como ya enviado
    if (!enabled) {
      appointment.reminderSentAt = new Date();
    } else {
      appointment.reminderSentAt = undefined;
    }
    
    await appointment.save();
    
    res.status(200).json({
      success: true,
      message: enabled 
        ? 'Recordatorios activados para esta cita' 
        : 'Recordatorios desactivados para esta cita',
      remindersEnabled: enabled
    });
  } catch (error) {
    console.error('Error al modificar recordatorio de cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Envía un recordatorio manual para una cita específica
 * Permite a los administradores enviar recordatorios manuales
 */
export const sendManualReminder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Verificar que el usuario sea administrador
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para realizar esta acción'
      });
    }
    
    // Buscar la cita
    const appointment = await Appointment.findById(id)
      .populate('user')
      .populate('services');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Cita no encontrada'
      });
    }
    
    // Verificar que la cita no esté cancelada
    if (appointment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'No se puede enviar recordatorio para una cita cancelada'
      });
    }
    
    // Verificar que la cita no sea en el pasado
    if (new Date(appointment.date) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'No se puede enviar recordatorio para una cita pasada'
      });
    }
    
    // Enviar recordatorio
    try {
      const user = appointment.user as any;
      if (!user.email) {
        return res.status(400).json({
          success: false,
          message: 'El usuario no tiene un correo electrónico registrado'
        });
      }
      
      // Obtener nombres de servicios
      const services = appointment.services.map((service: any) => {
        return typeof service === 'string' ? 'Servicio' : service.name;
      });
      
      // Enviar el recordatorio
      await sendAppointmentReminder(
        user.email,
        {
          date: appointment.date,
          time: appointment.time,
          services,
          userName: user.name
        }
      );
      
      // Marcar como enviado
      appointment.reminderSent = true;
      appointment.reminderSentAt = new Date();
      await appointment.save();
      
      res.status(200).json({
        success: true,
        message: 'Recordatorio enviado con éxito'
      });
    } catch (emailError) {
      console.error(`Error enviando recordatorio manual:`, emailError);
      res.status(500).json({
        success: false,
        message: 'Error al enviar el recordatorio por correo',
        details: process.env.NODE_ENV === 'development' ? (emailError as Error).message : undefined
      });
    }
  } catch (error) {
    console.error('Error en recordatorio manual:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};