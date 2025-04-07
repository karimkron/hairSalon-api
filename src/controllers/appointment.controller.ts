import { Response } from 'express';
import { AuthRequest} from "../types/request"
import mongoose, { ClientSession } from 'mongoose';
import { Appointment } from '../models/Appointment';
import { Service } from '../models/Service';
import { User } from '../models/User';
import { Schedule } from '../models/Schedule';
import { 
  sendBookingConfirmation, 
  sendReschedulingNotification,
  sendCancellationNotification,
  sendScheduleChangeNotification
} from '../services/email.service';
import { appointmentService } from '../services/appointment.service';
import { isDateInRange } from '../utils/dateUtils';
import { generateTimeSlots, normalizeDayName } from '../controllers/availability.controller';

const MAX_BOOKING_MONTHS = 2;
const CANCELLATION_PERIOD_HOURS = 24; // Horas de antelación para cancelar sin penalización

/**
 * @description Verifica si existe un conflicto de horario para la cita solicitada
 * @param date - Fecha de la cita
 * @param time - Hora de la cita
 * @param duration - Duración de la cita en minutos
 * @param existingAppointmentId - ID de la cita a excluir (para modificaciones)
 * @param session - Sesión de MongoDB
 * @returns Boolean indicando si hay conflicto
 */
const checkTimeConflict = async (
  date: Date, 
  time: string, 
  duration: number, 
  existingAppointmentId?: string,
  session?: ClientSession | null
): Promise<boolean> => {
  // Convertir tiempo de string "HH:MM" a minutos desde el inicio del día
  const [hours, minutes] = time.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + duration;

  // Buscar citas existentes en el mismo día
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);
  
  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);

  const query: any = {
    date: { $gte: dateStart, $lte: dateEnd },
    status: { $ne: 'cancelled' }
  };

  // Excluir la cita actual en caso de modificación
  if (existingAppointmentId) {
    query._id = { $ne: new mongoose.Types.ObjectId(existingAppointmentId) };
  }

  const appointments = await Appointment.find(query, null, { session }).lean();

  // Verificar solapamiento con otras citas
  for (const appointment of appointments) {
    const [appHours, appMinutes] = appointment.time.split(':').map(Number);
    const appStartMinutes = appHours * 60 + appMinutes;
    const appEndMinutes = appStartMinutes + appointment.totalDuration;

    // Verificar si hay solapamiento
    if (
      (startMinutes >= appStartMinutes && startMinutes < appEndMinutes) ||
      (endMinutes > appStartMinutes && endMinutes <= appEndMinutes) ||
      (startMinutes <= appStartMinutes && endMinutes >= appEndMinutes)
    ) {
      return true; // Hay conflicto
    }
  }

  return false; // No hay conflicto
}

/**
 * @description Verifica si el horario del local permite agendar una cita
 * @param date - Fecha de la cita
 * @param time - Hora de la cita
 * @param duration - Duración de la cita en minutos
 * @param session - Sesión de MongoDB
 * @returns Object con disponibilidad y mensaje
 */
const checkBusinessAvailability = async (
  date: Date, 
  time: string, 
  duration: number,
  session?: ClientSession | null
): Promise<{ available: boolean; message?: string }> => {
  // Obtener configuración de horarios
  const schedule = await Schedule.findOne().session(session || null).lean();
  
  if (!schedule) {
    return { available: false, message: 'No se encontró configuración de horarios' };
  }

  // Verificar día especial (vacaciones, días festivos)
  const dateString = date.toISOString().split('T')[0];
  const specialDay = schedule.specialDays.find(day => 
    new Date(day.date).toISOString().split('T')[0] === dateString
  );

  if (specialDay && specialDay.schedule.closed) {
    return { available: false, message: 'El local está cerrado en esta fecha' };
  }

  // Determinar si es un día especial o regular
  let daySchedule: any;
  
  if (specialDay) {
    daySchedule = specialDay.schedule;
  } else {
    // Verificar horario regular
    const dayName = normalizeDayName(date) as keyof typeof schedule.regularHours;
    daySchedule = schedule.regularHours[dayName];
  }

  if (!daySchedule || daySchedule.closed) {
    return { available: false, message: 'El local está cerrado este día de la semana' };
  }

  // Generar slots disponibles
  const timeSlots = generateTimeSlots(daySchedule, duration);
  
  if (!timeSlots.includes(time)) {
    return { 
      available: false, 
      message: 'El horario seleccionado está fuera de las horas de operación' 
    };
  }

  // Verificar si el servicio cabe dentro del horario de operación
  const [hours, minutes] = time.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + duration;

  // Verificar AM y PM
  let fits = false;
  let remainingTime = 0;
  
  if (daySchedule.openingAM && daySchedule.closingAM) {
    const [amCloseHours, amCloseMin] = daySchedule.closingAM.split(':').map(Number);
    const amCloseTimeInMinutes = amCloseHours * 60 + amCloseMin;
    
    if (startMinutes < amCloseTimeInMinutes) {
      if (endMinutes <= amCloseTimeInMinutes) {
        fits = true;
      } else {
        remainingTime = amCloseTimeInMinutes - startMinutes;
      }
    }
  }
  
  if (!fits && daySchedule.openingPM && daySchedule.closingPM) {
    const [pmCloseHours, pmCloseMin] = daySchedule.closingPM.split(':').map(Number);
    const pmCloseTimeInMinutes = pmCloseHours * 60 + pmCloseMin;
    
    if (startMinutes < pmCloseTimeInMinutes) {
      if (endMinutes <= pmCloseTimeInMinutes) {
        fits = true;
      } else {
        remainingTime = pmCloseTimeInMinutes - startMinutes;
      }
    }
  }
  
  if (!fits) {
    return {
      available: false,
      message: `El servicio dura ${duration} minutos, pero solo quedan ${remainingTime} minutos hasta el cierre`
    };
  }

  return { available: true };
}

/**
 * @description Crea una nueva cita
 */
export const createAppointment = async (req: AuthRequest, res: Response) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { services, date, time, notes } = req.body;
    
    if (!req.user) {
      await session.abortTransaction();
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const appointmentDate = new Date(date);
    
    // Validar que la fecha no esté en el pasado
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No se pueden crear citas en días pasados' });
    }

    // Validar rango de fechas permitido
    if (!isDateInRange(appointmentDate, MAX_BOOKING_MONTHS)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: `Solo puedes reservar con máximo ${MAX_BOOKING_MONTHS} meses de anticipación` 
      });
    }

    // Validar servicios
    if (!services || !Array.isArray(services) || services.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Debes seleccionar al menos un servicio' });
    }

    // Obtener información de los servicios
    const servicesData = await Service.find({ _id: { $in: services } }).session(session).lean();
    if (servicesData.length !== services.length) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Uno o más servicios seleccionados no existen' });
    }

    // Calcular duración total
    const totalDuration = servicesData.reduce((sum, service) => sum + service.duration, 0);

    // Verificar disponibilidad del negocio
    const businessAvailability = await checkBusinessAvailability(
      appointmentDate, 
      time, 
      totalDuration,
      session
    );

    if (!businessAvailability.available) {
      await session.abortTransaction();
      return res.status(400).json({ error: businessAvailability.message });
    }

    // Verificar disponibilidad de la cita (nuevo método mejorado)
    const appointmentAvailability = await appointmentService.verifyAppointmentAvailability(
      appointmentDate, 
      time, 
      totalDuration,
      session
    );
    
    if (!appointmentAvailability.available) {
      // Si hay un conflicto, intentar resolver automáticamente
      if (appointmentAvailability.conflictExists) {
        // Intentar resolver el conflicto reubicando la cita
        const alternativeAppointment = await appointmentService.handleAppointmentConflict(
          appointmentDate,
          time,
          req.user.id,
          services.map((id: string) => id.toString()),
          totalDuration,
          session
        );
        
        if (alternativeAppointment) {
          await session.commitTransaction();
          return res.status(200).json({
            success: true,
            rescheduled: true,
            message: 'El horario seleccionado fue reservado simultáneamente. Hemos reprogramado tu cita automáticamente.',
            appointment: {
              ...alternativeAppointment.toObject(),
              services: servicesData
            }
          });
        } else {
          // No se pudo resolver automáticamente
          await session.abortTransaction();
          return res.status(409).json({
            error: 'El horario seleccionado ya ha sido reservado y no se pudo encontrar un horario alternativo. Por favor, selecciona otro horario.',
            concurrent: true
          });
        }
      }
      
      await session.abortTransaction();
      return res.status(400).json({ error: appointmentAvailability.message || 'No se puede crear la cita en este horario' });
    }

    try {
      // Crear nueva cita
      const newAppointment = new Appointment({
        user: req.user.id,
        services: services.map((id: string) => new mongoose.Types.ObjectId(id)),
        date: appointmentDate,
        time,
        totalDuration,
        status: 'pending',
        notes: notes || '',
        reminderSent: false,
        createdAt: new Date(),
      });

      await newAppointment.save({ session });

      // Enviar correo de confirmación
      if (req.user.email) {
        try {
          const user = await User.findById(req.user.id).session(session).lean();
          
          if (user) {
            await sendBookingConfirmation(
              user.email,
              { 
                date: newAppointment.date, 
                time: newAppointment.time, 
                services: servicesData.map(s => s.name),
                userName: user.name
              }
            );
          }
        } catch (emailError) {
          console.error('Error al enviar confirmación por email:', emailError);
          // No abortamos la transacción por un error de email
        }
      }

      await session.commitTransaction();
      res.status(201).json({ 
        success: true, 
        appointment: {
          ...newAppointment.toObject(),
          services: servicesData
        }
      });
      
    } catch (error: any) {
      // Si ocurre un error de duplicado (conflicto de cita)
      if (error.code === 11000 && error.keyPattern && (error.keyPattern['date'] || error.keyPattern['time'])) {
        console.log('Detectado conflicto de cita concurrente, intentando resolver automáticamente...');
        
        // Intentar resolver el conflicto reubicando la cita
        const alternativeAppointment = await appointmentService.handleAppointmentConflict(
          appointmentDate,
          time,
          req.user.id,
          services.map((id: string) => id.toString()),
          totalDuration,
          session
        );
        
        if (alternativeAppointment) {
          await session.commitTransaction();
          return res.status(200).json({
            success: true,
            rescheduled: true,
            message: 'El horario seleccionado fue reservado simultáneamente. Hemos reprogramado tu cita automáticamente.',
            appointment: {
              ...alternativeAppointment.toObject(),
              services: servicesData
            }
          });
        } else {
          // No se pudo resolver automáticamente
          await session.abortTransaction();
          return res.status(409).json({
            error: 'El horario seleccionado ya ha sido reservado. Por favor, selecciona otro horario.',
            concurrent: true
          });
        }
      }
      
      // Para otros tipos de errores
      throw error;
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al crear cita:', error);
    res.status(500).json({ 
      error: 'Error al crear la cita', 
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined 
    });
  } finally {
    session.endSession();
  }
};

/**
 * @description Cancela una cita existente
 */
export const cancelAppointment = async (req: AuthRequest, res: Response) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const appointment = await Appointment.findById(id).session(session);

    if (!appointment) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    // Verificar permisos (solo el propietario o admin puede cancelar)
    if (appointment.user.toString() !== req.user?.id && req.user?.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'No tienes permiso para cancelar esta cita' });
    }

    // Validar tiempo de cancelación (política de cancelación)
    const appointmentDateTime = new Date(appointment.date);
    appointmentDateTime.setHours(
      parseInt(appointment.time.split(':')[0]),
      parseInt(appointment.time.split(':')[1]),
      0, 0
    );
    
    const now = new Date();
    const hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    // Actualizar estado de la cita
    appointment.status = 'cancelled';
    appointment.cancellationReason = reason || 'Cancelado por el usuario';
    appointment.cancelledAt = new Date();
    
    await appointment.save({ session });

    // Notificar al usuario
    try {
      const user = await User.findById(appointment.user).session(session).lean();
      
      if (user && user.email) {
        await sendCancellationNotification(
          user.email,
          {
            date: appointment.date,
            time: appointment.time,
            lateCancellation: hoursUntilAppointment < CANCELLATION_PERIOD_HOURS,
            userName: user.name
          }
        );
      }
    } catch (emailError) {
      console.error('Error al enviar notificación de cancelación:', emailError);
      // No abortamos por error de email
    }

    await session.commitTransaction();
    res.status(200).json({ 
      success: true, 
      message: 'Cita cancelada correctamente',
      lateCancellation: hoursUntilAppointment < CANCELLATION_PERIOD_HOURS
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al cancelar cita:', error);
    res.status(500).json({ 
      error: 'Error al cancelar la cita',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  } finally {
    session.endSession();
  }
};

/**
 * @description Reprograma una cita existente
 */
export const rescheduleAppointment = async (req: AuthRequest, res: Response) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { date, time, services } = req.body;
    
    // Buscar la cita original
    const appointment = await Appointment.findById(id)
      .populate('services')
      .session(session);
    
    if (!appointment) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    // Verificar permisos
    if (appointment.user.toString() !== req.user?.id && req.user?.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'No tienes permiso para modificar esta cita' });
    }

    // Verificar que la cita no esté cancelada
    if (appointment.status === 'cancelled') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No puedes reprogramar una cita cancelada' });
    }

    // Fecha y hora nuevas
    const newDate = date ? new Date(date) : appointment.date;
    const newTime = time || appointment.time;
    
    // Validar que la nueva fecha no esté en el pasado
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No puedes reprogramar para una fecha pasada' });
    }

    // Validar rango de fechas permitido
    if (!isDateInRange(newDate, MAX_BOOKING_MONTHS)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: `Solo puedes reservar con máximo ${MAX_BOOKING_MONTHS} meses de anticipación` 
      });
    }

    // Determinar servicios y duración
    let updatedServices = appointment.services;
    let totalDuration = appointment.totalDuration;
    
    if (services && Array.isArray(services)) {
      // Verificar y actualizar servicios si se proporcionan nuevos
      const servicesData = await Service.find({ _id: { $in: services } }).session(session).lean();
      
      if (servicesData.length !== services.length) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Uno o más servicios seleccionados no existen' });
      }
      
      // Actualizar servicios y recalcular duración
      updatedServices = services.map((id: string) => new mongoose.Types.ObjectId(id));
      totalDuration = servicesData.reduce((sum, service) => sum + service.duration, 0);
    }

    // Verificar disponibilidad del negocio
    const businessAvailability = await checkBusinessAvailability(
      newDate, 
      newTime, 
      totalDuration,
      session
    );

    if (!businessAvailability.available) {
      await session.abortTransaction();
      return res.status(400).json({ error: businessAvailability.message });
    }

    // Verificar conflictos con otras citas
    const hasConflict = await checkTimeConflict(
      newDate, 
      newTime, 
      totalDuration, 
      (appointment._id as mongoose.Types.ObjectId).toString(),
      session
    );
    
    if (hasConflict) {
      await session.abortTransaction();
      return res.status(409).json({ 
        error: 'El horario seleccionado ya está reservado. Por favor, elige otra hora.' 
      });
    }

    // Guardar información antigua para el email
    const oldDate = new Date(appointment.date);
    const oldTime = appointment.time;

    // Actualizar la cita
    appointment.date = newDate;
    appointment.time = newTime;
    appointment.services = updatedServices;
    appointment.totalDuration = totalDuration;
    appointment.updatedAt = new Date();
    
    try {
      await appointment.save({ session });
    } catch (error: any) {
      // Si ocurre un error de duplicado (conflicto de cita)
      if (error.code === 11000 && error.keyPattern && (error.keyPattern['date'] || error.keyPattern['time'])) {
        console.log('Detectado conflicto de reprogramación concurrente, intentando resolver automáticamente...');
        
        // Intentar resolver el conflicto reubicando la cita
        const alternativeAppointment = await appointmentService.handleAppointmentConflict(
          newDate,
          newTime,
          req.user.id,
          Array.isArray(services) 
            ? services.map((id: string) => id.toString())
            : (appointment.services as any).map((s: any) => s._id.toString()),
          totalDuration,
          session
        );
        
        if (alternativeAppointment) {
          // Cancelar la cita original
          appointment.status = 'cancelled';
          appointment.cancellationReason = 'Cancelada automáticamente por reprogramación';
          appointment.cancelledAt = new Date();
          await appointment.save({ session });
          
          await session.commitTransaction();
          return res.status(200).json({
            success: true,
            rescheduled: true,
            message: 'El horario seleccionado fue reservado simultáneamente. Hemos reprogramado tu cita automáticamente.',
            appointment: alternativeAppointment.toObject()
          });
        } else {
          // No se pudo resolver automáticamente
          await session.abortTransaction();
          return res.status(409).json({
            error: 'El horario seleccionado ya ha sido reservado. Por favor, selecciona otro horario.',
            concurrent: true
          });
        }
      }
      
      // Para otros tipos de errores
      throw error;
    }

    // Enviar notificación de reprogramación
    try {
      const user = await User.findById(appointment.user).session(session).lean();
      const servicesInfo = await Service.find({ _id: { $in: updatedServices } })
        .select('name')
        .session(session)
        .lean();
      
      if (user && user.email) {
        await sendReschedulingNotification(
          user.email,
          {
            oldDate,
            oldTime,
            newDate,
            newTime,
            services: servicesInfo.map(s => s.name),
            userName: user.name
          }
        );
      }
    } catch (emailError) {
      console.error('Error al enviar notificación de reprogramación:', emailError);
      // No abortamos por error de email
    }

    await session.commitTransaction();
    res.status(200).json({ 
      success: true, 
      message: 'Cita reprogramada correctamente',
      appointment: appointment.toObject()
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al reprogramar cita:', error);
    res.status(500).json({ 
      error: 'Error al reprogramar la cita',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  } finally {
    session.endSession();
  }
};

/**
 * @description Obtiene las citas del usuario actual
 */
export const getUserAppointments = async (req: AuthRequest, res: Response) => {
  try {
    // Obtener parámetros de filtrado opcionales
    const { status, from, to } = req.query;
    
    // Construir filtro base
    const filter: any = { user: req.user?.id };
    
    // Agregar filtro por estado
    if (status) {
      // Si status viene como string con valores separados por coma, convertirlo a array para $in
      if (typeof status === 'string' && status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }
    
    // Agregar filtro por rango de fechas
    if (from || to) {
      filter.date = {};
      
      if (from) {
        filter.date.$gte = new Date(from as string);
      }
      
      if (to) {
        filter.date.$lte = new Date(to as string);
      }
    }
    
    console.log('Filtro de consulta:', JSON.stringify(filter, null, 2));
    console.log('Usuario actual:', req.user?.id);
    
    // Obtener citas con filtros aplicados
    const appointments = await Appointment.find(filter)
      .populate('services', 'name duration price description category')
      .sort({ date: 1, time: 1 });
    
    console.log(`Citas encontradas: ${appointments.length}`);
    
    res.status(200).json(appointments);
  } catch (error) {
    console.error('Error al obtener citas del usuario:', error);
    res.status(500).json({ 
      error: 'Error al obtener citas',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Obtiene detalles de una cita específica
 */
export const getAppointmentDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const appointment = await Appointment.findById(id)
      .populate('services', 'name duration price description category')
      .populate('user', 'name email phone');
    
    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    // Verificar permisos (solo el propietario o admin puede ver detalles)
    if (appointment.user.toString() !== req.user?.id && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para ver esta cita' });
    }
    
    res.status(200).json(appointment);
  } catch (error) {
    console.error('Error al obtener detalles de la cita:', error);
    res.status(500).json({ 
      error: 'Error al obtener detalles de la cita',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Notifica a los usuarios sobre un cambio en el horario del local que afecta sus citas
 */
export const notifyScheduleChange = async (req: AuthRequest, res: Response) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { date, reason } = req.body;
    
    if (!date) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Se requiere la fecha del cambio de horario' });
    }
    
    // Formato de fecha para búsqueda
    const changeDate = new Date(date);
    changeDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(changeDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // Buscar citas afectadas
    const affectedAppointments = await Appointment.find({
      date: { $gte: changeDate, $lt: nextDay },
      status: { $ne: 'cancelled' }
    })
    .populate('user')
    .populate('services')
    .session(session);
    
    if (affectedAppointments.length === 0) {
      await session.abortTransaction();
      return res.status(200).json({ 
        message: 'No hay citas programadas para esta fecha' 
      });
    }
    
    // Enviar notificaciones a los usuarios afectados
    const notificationPromises = affectedAppointments.map(async (appointment) => {
      try {
        // Verificar que el usuario tenga email
        const user = appointment.user as any;
        if (!user || !user.email) {
          console.warn(`Usuario sin email para la cita ${appointment._id}`);
          return;
        }
        
        const serviceNames = appointment.services.map((service: any) => {
          if (typeof service === 'string') return 'Servicio';
          return service.name;
        });
        
        await sendScheduleChangeNotification(
          user.email,
          {
            date: appointment.date,
            time: appointment.time,
            services: serviceNames,
            reason: reason || 'Cambio de horario del local',
            userName: user.name || 'Cliente'
          }
        );
        
        // Opcionalmente, marcar la cita como necesita reprogramación
        appointment.status = 'needsRescheduling';
        appointment.notes = `${appointment.notes || ''}\nCancelado por el local: ${reason || 'Cambio de horario'}`;
        await appointment.save({ session });
        
      } catch (emailError) {
        console.error(`Error al notificar al usuario de la cita ${appointment._id}:`, emailError);
        // Continuar con otros usuarios incluso si hay error con uno
      }
    });
    
    await Promise.all(notificationPromises);
    
    await session.commitTransaction();
    res.status(200).json({ 
      success: true, 
      message: `Se han notificado a ${affectedAppointments.length} clientes sobre el cambio de horario`,
      affectedAppointments: affectedAppointments.length
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al notificar cambio de horario:', error);
    res.status(500).json({ 
      error: 'Error al procesar la notificación de cambio de horario',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  } finally {
    session.endSession();
  }
};