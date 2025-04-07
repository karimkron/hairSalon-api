import { Appointment } from '../models/Appointment';
import { Service } from '../models/Service';
import { User } from '../models/User';
import { Schedule } from '../models/Schedule';
import { sendReschedulingNotification, sendConflictReschedulingNotification } from './email.service';
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
    try {
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
          status: { $nin: ['cancelled'] },
        }).session(session || null);
        
        const bookedTimes = new Set<string>();
        existingAppointments.forEach(app => {
          // Para cada cita existente, marcar como ocupados tanto su horario como los slots que ocupa según su duración
          const startTime = app.time;
          const [startHours, startMinutes] = startTime.split(':').map(Number);
          const startMinutesTotal = startHours * 60 + startMinutes;
          const endMinutesTotal = startMinutesTotal + app.totalDuration;
          
          // Marcar todos los slots de 30 minutos que ocupa esta cita
          for (let minutes = startMinutesTotal; minutes < endMinutesTotal; minutes += 30) {
            const slotHours = Math.floor(minutes / 60);
            const slotMinutes = minutes % 60;
            const timeSlot = `${slotHours.toString().padStart(2, '0')}:${slotMinutes.toString().padStart(2, '0')}`;
            bookedTimes.add(timeSlot);
          }
        });
        
        // Para el día actual, solo considerar horas después de la hora original
        let validTimes: string[] = [];
        
        if (dayOffset === 0) {
          // Primer día: filtrar por tiempo y disponibilidad
          validTimes = availableTimes.filter(time => {
            const [h, m] = time.split(':').map(Number);
            const timeDate = new Date(currentDate);
            timeDate.setHours(h, m);
            
            // Solo considerar slots que sean posteriores a la hora actual + 30 min
            return timeDate > currentTime && !bookedTimes.has(time);
          });
        } else {
          // Días siguientes: filtrar solo por disponibilidad
          validTimes = availableTimes.filter(time => !bookedTimes.has(time));
        }
        
        // Verificar si algún horario disponible puede acomodar la duración del servicio
        for (const time of validTimes) {
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
          
          // Verificar si todos los slots necesarios están disponibles
          if (fits) {
            let allSlotsAvailable = true;
            const startMinutesTotal = hours * 60 + minutes;
            const endMinutesTotal = startMinutesTotal + duration;
            
            // Verificar slots de 30 minutos dentro de la duración del servicio
            for (let mins = startMinutesTotal; mins < endMinutesTotal; mins += 30) {
              if (mins === startMinutesTotal) continue; // El slot inicial ya sabemos que está disponible
              
              const slotHours = Math.floor(mins / 60);
              const slotMinutes = mins % 60;
              const timeSlot = `${slotHours.toString().padStart(2, '0')}:${slotMinutes.toString().padStart(2, '0')}`;
              
              if (bookedTimes.has(timeSlot)) {
                allSlotsAvailable = false;
                break;
              }
            }
            
            if (allSlotsAvailable) {
              return {
                date: currentDate,
                time: time
              };
            }
          }
        }
      }
      
      // Si llegamos aquí, no encontramos ningún slot disponible
      return null;
    } catch (error) {
      console.error('Error finding next available slot:', error);
      return null;
    }
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
        await sendConflictReschedulingNotification(
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
  },

  /**
   * Verificar si una cita puede ser creada sin conflictos
   * @param date Fecha de la cita
   * @param time Hora de la cita
   * @param duration Duración del servicio
   * @param session Sesión de MongoDB
   * @returns Objeto indicando si está disponible y si hay conflictos
   */
  async verifyAppointmentAvailability(
    date: Date,
    time: string,
    duration: number,
    session?: ClientSession
  ): Promise<{ available: boolean; conflictExists: boolean; message?: string }> {
    try {
      const dateStart = startOfDay(date);
      const dateEnd = endOfDay(date);
      
      // Buscar citas existentes en el mismo día
      const existingAppointments = await Appointment.find({
        date: { $gte: dateStart, $lte: dateEnd },
        status: { $nin: ['cancelled'] },
      }).session(session || null);
      
      // Verificar si hay conflictos
      const [hours, minutes] = time.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + duration;
      
      for (const appointment of existingAppointments) {
        const [appHours, appMinutes] = appointment.time.split(':').map(Number);
        const appStartMinutes = appHours * 60 + appMinutes;
        const appEndMinutes = appStartMinutes + appointment.totalDuration;
        
        // Verificar si hay solapamiento
        if (
          (startMinutes >= appStartMinutes && startMinutes < appEndMinutes) ||
          (endMinutes > appStartMinutes && endMinutes <= appEndMinutes) ||
          (startMinutes <= appStartMinutes && endMinutes >= appEndMinutes)
        ) {
          return { 
            available: false, 
            conflictExists: true,
            message: 'El horario seleccionado ya está reservado'
          };
        }
      }
      
      return { available: true, conflictExists: false };
    } catch (error) {
      console.error('Error verifying appointment availability:', error);
      throw error;
    }
  }
};