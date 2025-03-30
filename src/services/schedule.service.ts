// Agregar este nuevo servicio para manejar cambios de horario
import { Appointment } from '../models/Appointment';
import { Schedule } from '../models/Schedule';
import { User } from '../models/User';
import { sendScheduleChangeNotification } from './email.service';
import mongoose from 'mongoose';
import { startOfDay, endOfDay } from 'date-fns';

export const scheduleService = {
  /**
   * Procesa un cambio de horario del negocio y maneja las citas afectadas
   * @param date - Fecha modificada
   * @param isClosed - Indica si el día estará cerrado
   * @param reason - Razón del cambio (opcional)
   */
  async processScheduleChange(date: Date, isClosed: boolean, reason?: string): Promise<{ 
    success: boolean; 
    affectedAppointments: number;
    message: string;
  }> {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Convertir a fechas para comparar
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      // Si el día no estará cerrado, no hay nada que procesar
      if (!isClosed) {
        await session.abortTransaction();
        return { 
          success: true, 
          affectedAppointments: 0,
          message: 'No hay cambios que afecten a citas existentes' 
        };
      }
      
      // Buscar citas afectadas (no canceladas) en ese día
      const affectedAppointments = await Appointment.find({
        date: { $gte: dayStart, $lte: dayEnd },
        status: { $nin: ['cancelled', 'completed'] }
      })
      .populate('user')
      .populate('services')
      .session(session);
      
      if (affectedAppointments.length === 0) {
        await session.abortTransaction();
        return { 
          success: true, 
          affectedAppointments: 0,
          message: 'No hay citas afectadas por este cambio' 
        };
      }
      
      // Preparar motivo por defecto si no se proporciona
      const cancellationReason = reason || 'Cambio en el horario de la peluquería';
      
      // Procesar cada cita afectada
      for (const appointment of affectedAppointments) {
        // Cambiar estado a cancelado
        appointment.status = 'cancelled';
        appointment.cancellationReason = cancellationReason;
        appointment.cancelledAt = new Date();
        await appointment.save({ session });
        
        // Enviar notificación por email
        const user = appointment.user as any;
        if (user && user.email) {
          const serviceNames = appointment.services.map((service: any) => {
            return typeof service === 'object' && service.name ? service.name : 'Servicio';
          });
          
          try {
            await sendScheduleChangeNotification(
              user.email,
              {
                date: appointment.date,
                time: appointment.time,
                services: serviceNames,
                reason: cancellationReason,
                userName: user.name || 'Cliente'
              }
            );
          } catch (emailError) {
            console.error(`Error al enviar notificación por email a ${user.email}:`, emailError);
            // Continuamos con el proceso aunque falle el envío de email
          }
        }
      }
      
      await session.commitTransaction();
      
      return {
        success: true,
        affectedAppointments: affectedAppointments.length,
        message: `Se han cancelado ${affectedAppointments.length} citas afectadas por el cambio de horario`
      };
    } catch (error) {
      await session.abortTransaction();
      console.error('Error al procesar cambio de horario:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
};