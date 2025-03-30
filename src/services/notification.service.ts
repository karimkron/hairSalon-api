import { Appointment } from '../models/Appointment';
import { User } from '../models/User';
import { Service } from '../models/Service';
import { sendAppointmentReminder } from './email.service';
import { addDays, subDays, startOfDay, endOfDay } from 'date-fns';

/**
 * Servicio para manejar notificaciones y recordatorios del sistema
 */
export const notificationService = {
  /**
   * Envía recordatorios para las citas del día siguiente
   * Esta función está diseñada para ejecutarse una vez al día mediante un cron job
   */
  async sendAppointmentReminders(): Promise<{success: boolean, count: number}> {
    try {
      // Calcular el rango de fechas para mañana
      const tomorrow = addDays(new Date(), 1);
      const tomorrowStart = startOfDay(tomorrow);
      const tomorrowEnd = endOfDay(tomorrow);
      
      // Buscar citas para mañana que no hayan sido canceladas y que no tengan recordatorio enviado
      const appointments = await Appointment.find({
        date: { $gte: tomorrowStart, $lte: tomorrowEnd },
        status: { $in: ['pending', 'confirmed'] },
        reminderSent: false
      }).populate('user')
        .populate('services');
      
      if (appointments.length === 0) {
        return { success: true, count: 0 };
      }
      
      // Enviar recordatorios
      let sentCount = 0;
      
      for (const appointment of appointments) {
        try {
          // Asegurarse de que el usuario tiene email
          const user = appointment.user as any;
          if (!user.email) continue;
          
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
          
          sentCount++;
        } catch (err) {
          console.error(`Error enviando recordatorio para la cita ${appointment._id}:`, err);
          // Continuar con el siguiente aunque haya errores
        }
      }
      
      return { success: true, count: sentCount };
    } catch (error) {
      console.error('Error enviando recordatorios de citas:', error);
      return { success: false, count: 0 };
    }
  },
  
  /**
   * Marca las citas pasadas como completadas
   * Esta función está diseñada para ejecutarse diariamente mediante un cron job
   */
  async markCompletedAppointments(): Promise<{success: boolean, count: number}> {
    try {
      // Fecha de ayer
      const yesterday = subDays(new Date(), 1);
      const yesterdayEnd = endOfDay(yesterday);
      
      // Actualizar citas pasadas que aún están en pending o confirmed
      const result = await Appointment.updateMany(
        {
          date: { $lte: yesterdayEnd },
          status: { $in: ['pending', 'confirmed'] }
        },
        { 
          $set: { 
            status: 'completed',
            updatedAt: new Date()
          }
        }
      );
      
      return { success: true, count: result.modifiedCount };
    } catch (error) {
      console.error('Error marcando citas como completadas:', error);
      return { success: false, count: 0 };
    }
  },
  
  /**
   * Identifica citas que requieren atención por un cambio en el horario
   * @param date - Fecha con horario modificado
   * @param message - Mensaje para incluir en la notificación
   */
  async identifyAffectedAppointments(date: Date, message: string): Promise<any[]> {
    const dateStart = startOfDay(date);
    const dateEnd = endOfDay(date);
    
    const affectedAppointments = await Appointment.find({
      date: { $gte: dateStart, $lte: dateEnd },
      status: { $in: ['pending', 'confirmed'] }
    }).populate('user')
      .populate('services');
      
    return affectedAppointments;
  }
};

export default notificationService;