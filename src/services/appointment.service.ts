import { Appointment } from '../models/Appointment';
import { Service } from '../models/Service';
import { User } from '../models/User';
import { Schedule } from '../models/Schedule';
import { sendReschedulingNotification } from './email.service';
import mongoose, { ClientSession } from 'mongoose';
import { addDays, format, parse, addMinutes, startOfDay, endOfDay } from 'date-fns';

/**
 * @description Servicio para gestionar las citas y manejar casos especiales como conflictos de horario
 */
export const appointmentService = {
  /**
   * Encuentra un próximo horario disponible para una cita que ha tenido un conflicto
   * @param originalDate - Fecha original solicitada para la cita
   * @param originalTime - Hora original solicitada
   * @param duration - Duración del servicio en minutos
   * @param maxDays - Máximo número de días a buscar hacia adelante
   * @param session - Sesión de MongoDB para operaciones transaccionales
   * @returns El próximo slot disponible o null si no encuentra ninguno
   */
  async findNextAvailableSlot(
    originalDate: Date,
    originalTime: string,
    duration: number,
    maxDays: number = 7,
    session?: ClientSession
  ): Promise<{ date: Date; time: string } | null> {
    // Convertir a objetos Date para facilitar manipulación
    const startDateObj = new Date(originalDate);
    
    // Primero intentamos en el mismo día después de la hora solicitada
    const [origHours, origMinutes] = originalTime.split(':').map(Number);
    let currentTime = new Date(startDateObj);
    currentTime.setHours(origHours, origMinutes);
    
    // Añadir 30 minutos para el siguiente slot
    currentTime.setMinutes(currentTime.getMinutes() + 30);
    
    // Obtener configuración de horarios para verificar horarios permitidos
    const schedule = await Schedule.findOne().session(session || null).lean();
    if (!schedule) return null;
    
    // Buscar en el intervalo de días especificado (incluido el día actual)
    for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
      const currentDate = new Date(startDateObj);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      
      // Solo consideramos el mismo día para la primera iteración (para buscar slots después de la hora original)
      // Para los siguientes días, empezamos desde la primera hora disponible
      const dateStart = startOfDay(currentDate);
      const dateEnd = endOfDay(currentDate);
      
      // Verificar si el local está abierto en esta fecha
      const dateString = format(currentDate, 'yyyy-MM-dd');
      const specialDay = schedule.specialDays.find(day => 
        format(new Date(day.date), 'yyyy-MM-dd') === dateString
      );
      
      if (specialDay && specialDay.schedule.closed) {
        continue; // Si está cerrado, pasar al siguiente día
      }
      
      let daySchedule;
      const dayName = format(currentDate, 'EEEE').toLowerCase() as keyof typeof schedule.regularHours;
      
      if (specialDay) {
        daySchedule = specialDay.schedule;
      } else {
        daySchedule = schedule.regularHours[dayName];
        if (daySchedule.closed) {
          continue; // Local cerrado en este día de la semana
        }
      }
      
      // Crear un array con todos los horarios disponibles para este día
      let availableTimes: string[] = [];
      
      // Añadir horarios de mañana
      if (daySchedule.openingAM && daySchedule.closingAM) {
        const startMorning = parse(daySchedule.openingAM, 'HH:mm', new Date());
        const endMorning = parse(daySchedule.closingAM, 'HH:mm', new Date());
        
        let currentSlot = new Date(startMorning);
        while (currentSlot < endMorning) {
          availableTimes.push(format(currentSlot, 'HH:mm'));
          currentSlot.setMinutes(currentSlot.getMinutes() + 30); // Incrementos de 30 min
        }
      }
      
      // Añadir horarios de tarde
      if (daySchedule.openingPM && daySchedule.closingPM) {
        const startAfternoon = parse(daySchedule.openingPM, 'HH:mm', new Date());
        const endAfternoon = parse(daySchedule.closingPM, 'HH:mm', new Date());
        
        let currentSlot = new Date(startAfternoon);
        while (currentSlot < endAfternoon) {
          availableTimes.push(format(currentSlot, 'HH:mm'));
          currentSlot.setMinutes(currentSlot.getMinutes() + 30);
        }
      }
      
      // Filtrar slots que ya están ocupados
      const existingAppointments = await Appointment.find({
        date: { $gte: dateStart, $lte: dateEnd },
        status: { $ne: 'cancelled' },
      }).session(session || null);
      
      const bookedTimes = new Set(existingAppointments.map(app => app.time));
      
      // Para el día actual, solo considerar horas después de la hora original
      if (dayOffset === 0) {
        availableTimes = availableTimes.filter(time => {
          const [h, m] = time.split(':').map(Number);
          const timeDate = new Date(currentDate);
          timeDate.setHours(h, m);
          return timeDate > currentTime && !bookedTimes.has(time);
        });
      } else {
        availableTimes = availableTimes.filter(time => !bookedTimes.has(time));
      }
      
      // Verificar si algún horario disponible puede acomodar la duración del servicio
      for (const time of availableTimes) {
        const [hours, minutes] = time.split(':').map(Number);
        const startTime = new Date(currentDate);
        startTime.setHours(hours, minutes);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);
        
        // Verificar si la cita cabe en el horario de la mañana o tarde
        let fits = false;
        
        if (daySchedule.openingAM && daySchedule.closingAM) {
          const closingAM = parse(daySchedule.closingAM, 'HH:mm', new Date());
          const closing = new Date(currentDate);
          closing.setHours(closingAM.getHours(), closingAM.getMinutes());
          
          if (endTime <= closing) {
            fits = true;
          }
        }
        
        if (!fits && daySchedule.openingPM && daySchedule.closingPM) {
          const closingPM = parse(daySchedule.closingPM, 'HH:mm', new Date());
          const closing = new Date(currentDate);
          closing.setHours(closingPM.getHours(), closingPM.getMinutes());
          
          if (endTime <= closing) {
            fits = true;
          }
        }
        
        if (fits) {
          return {
            date: currentDate,
            time: time
          };
        }
      }
    }
    
    // Si llegamos aquí, no encontramos ningún slot disponible
    return null;
  },
  
  /**
   * Maneja un conflicto de cita reubicando automáticamente a un usuario
   * @param date Fecha de la cita con conflicto
   * @param time Hora de la cita con conflicto
   * @param userId ID del usuario cuya cita se va a reubicar
   * @param services Servicios para la cita
   * @param duration Duración total de la cita
   * @param session Sesión de MongoDB
   * @returns La nueva cita reubicada o null si no fue posible
   */
  async handleAppointmentConflict(
    date: Date,
    time: string,
    userId: string,
    services: string[],
    duration: number,
    session: ClientSession
  ): Promise<any> {
    try {
      // Buscar el próximo slot disponible
      const nextSlot = await this.findNextAvailableSlot(date, time, duration, 7, session);
      
      if (!nextSlot) {
        return null; // No se encontró un horario alternativo
      }
      
      // Crear la nueva cita con el horario alternativo
      const newAppointment = new Appointment({
        user: userId,
        services,
        date: nextSlot.date,
        time: nextSlot.time,
        totalDuration: duration,
        status: 'confirmed', // Confirmar automáticamente
        notes: 'Cita reprogramada automáticamente por conflicto de horario',
        reminderSent: false,
        createdAt: new Date(),
      });
      
      await newAppointment.save({ session });
      
      // Obtener información para el correo
      const user = await User.findById(userId).session(session);
      const servicesData = await Service.find({ _id: { $in: services } }).session(session);
      
      // Enviar notificación al usuario
      if (user && user.email) {
        await sendReschedulingNotification(
          user.email,
          {
            oldDate: date,
            oldTime: time,
            newDate: nextSlot.date,
            newTime: nextSlot.time,
            services: servicesData.map(s => s.name),
            userName: user.name
          }
        );
      }
      
      return newAppointment;
    } catch (error) {
      console.error('Error handling appointment conflict:', error);
      return null;
    }
  }
};