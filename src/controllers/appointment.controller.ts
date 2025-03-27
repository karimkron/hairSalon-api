import { Response, Request } from 'express';
import { AuthRequest } from '../types/request';
import { Appointment } from '../models/Appointment';
import { Schedule } from '../models/Schedule';
import { Service } from '../models/Service';
import mongoose, { ClientSession } from 'mongoose';
import { sendBookingConfirmation } from '../services/email.service';
import { startSession } from "mongoose";

// Constants
const MAX_BOOKING_MONTHS = 2;
const SLOT_DURATION = 30; // minutes

// Configuración de horarios regulares y días especiales (estos datos pueden provenir de la base de datos)
const regularHours: { [day: string]: { closed: boolean } } = {
  lunes: { closed: false },
  martes: { closed: false },
  miercoles: { closed: false },
  jueves: { closed: false },
  viernes: { closed: false },
  sabado: { closed: true },   // Sábado cerrado
  domingo: { closed: true }    // Domingo cerrado
};

const specialDays: Array<{ date: string, schedule: { closed: boolean } }> = [
  { date: "2025-04-10", schedule: { closed: true } } // Día especial cerrado
];

/**
 * Función para normalizar el nombre del día:
 * - Utiliza toLocaleDateString para obtener el día en español.
 * - Convierte a minúsculas y remueve tildes.
 */
function normalizeDayName(date: Date): string {
  const day = date.toLocaleDateString('es-ES', { weekday: 'long' });
  // Mapeo para quitar tildes
  const mapping: { [key: string]: string } = {
    'á': 'a',
    'é': 'e',
    'í': 'i',
    'ó': 'o',
    'ú': 'u'
  };
  return day
    .toLowerCase()
    .replace(/[áéíóú]/g, match => mapping[match]);
}


/**
 * Función que determina si un día está cerrado.
 * Se considera cerrado si:
 *  - El día corresponde a un horario regular marcado como cerrado (ej. sabado, domingo).
 *  - Es un día especial que se encuentra en specialDays con closed: true.
 */
function isDayClosed(date: Date): boolean {
  const dayName = normalizeDayName(date);
  // Verificar horario regular
  if (regularHours[dayName] && regularHours[dayName].closed) {
    return true;
  }
  // Verificar día especial
  const formattedDate = date.toISOString().split('T')[0];
  const specialDay = specialDays.find(d => d.date === formattedDate && d.schedule.closed);
  return !!specialDay;
}

/**
 * Función para generar un arreglo de fechas (día a día) para un rango determinado (en meses).
 */
function getDateRange(months: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + months);
  for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

// Generate time slots
const generateTimeSlots = (daySchedule: any, appointmentDate?: Date, totalDuration?: number): string[] => {
  if (!daySchedule || daySchedule.closed) return [];
  
  const parseTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const slots: string[] = [];
  const addSlots = (start: string, end: string) => {
    let current = parseTime(start);
    const endTime = parseTime(end);
    while (current <= endTime - SLOT_DURATION) {
      const h = Math.floor(current / 60).toString().padStart(2, '0');
      const m = (current % 60).toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
      current += SLOT_DURATION;
    }
  };

  addSlots(daySchedule.openingAM, daySchedule.closingAM);
  if (daySchedule.openingPM && daySchedule.closingPM) {
    addSlots(daySchedule.openingPM, daySchedule.closingPM);
  }

  return slots;
};

/**
* Endpoint: /available-days
* Retorna los días disponibles excluyendo sábados, domingos y días especiales cerrados.
*/
export const getAvailableDays = async (req: Request, res: Response): Promise<Response> => {
 try {
   const allDates = getDateRange(2);
   const availableDays = allDates
     .filter(date => !isDayClosed(date))
     .map(date => ({ date: date.toISOString().split('T')[0] }));
   return res.json(availableDays);
 } catch (error) {
   return res.status(500).json({ error: "Error al obtener días disponibles" });
 }
};

/**
 * Endpoint: /unavailable-days
 * Retorna los días no disponibles (incluye sábados, domingos y días especiales cerrados).
 */
export const getUnavailableDays = async (req: Request, res: Response): Promise<Response> => {
  try {
    const allDates = getDateRange(2);
    const unavailableDays = allDates
      .filter(date => isDayClosed(date))
      .map(date => ({ date: date.toISOString().split('T')[0] }));
    return res.json(unavailableDays);
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener días no disponibles" });
  }
};

/**
 * Endpoint: /availability?date=YYYY-MM-DD
 * - Si el día está cerrado, responde con un mensaje y slots vacíos.
 * - Si el día está abierto, genera y responde con los horarios disponibles.
 * Se utilizan transacciones para garantizar la consistencia en operaciones con la DB.
 */
export const getAvailability = async (req: Request, res: Response): Promise<Response> => {
  const { date } = (req as AuthRequest).query;
  if (!date || typeof date !== "string") {
    return res.status(400).json({ error: "Fecha inválida" });
  }

  try {
    const queryDate = new Date(date);
    const session = await startSession();
    session.startTransaction();
    try {
      if (isDayClosed(queryDate)) {
        await session.commitTransaction();
        session.endSession();
        return res.json({
          date,
          message: "La peluquería está cerrada este día",
          availableSlots: []
        });
      }
      // Si el día está abierto, se generan los horarios disponibles (ejemplo de slots)
      const availableSlots = [
        "09:00",
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00"
      ];
      await session.commitTransaction();
      session.endSession();
      return res.json({
        date,
        message: "Día disponible",
        availableSlots
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ error: "Error al procesar la disponibilidad" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Error en la conexión a la base de datos" });
  }
};

export const createAppointment = async (req: AuthRequest, res: Response) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { services, date, time } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const appointmentDate = new Date(date);
    if (!isDateInRange(appointmentDate)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: `Solo puedes reservar con máximo ${MAX_BOOKING_MONTHS} meses de anticipación` 
      });
    }

    const servicesData = await Service.find({ _id: { $in: services } }).session(session).lean();
    if (servicesData.length !== services.length) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Uno o más servicios no existen' });
    }

    const totalDuration = servicesData.reduce((sum, service) => sum + service.duration, 0);
    const schedule = await Schedule.findOne().session(session).lean();

    if (!schedule) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'No se encontró el horario' });
    }

    const timeSlots = generateTimeSlots(schedule, appointmentDate, totalDuration);
    const isValidSlot = timeSlots.includes(time);

    if (!isValidSlot) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'El horario seleccionado no está disponible' });
    }

    const existingAppointment = await Appointment.findOne({
      date: appointmentDate,
      time,
      status: { $ne: 'cancelled' }
    }).session(session);

    if (existingAppointment) {
      await session.abortTransaction();
      return res.status(409).json({ error: 'El horario ya está reservado' });
    }

    const newAppointment = new Appointment({
      user: req.user.id,
      services: services.map((id: string) => new mongoose.Types.ObjectId(id)),
      date: appointmentDate,
      time,
      totalDuration,
      status: 'pending',
    });

    await newAppointment.save({ session });

    if (req.user.email) {
      try {
        await sendBookingConfirmation(
          req.user.email,
          {
            date: newAppointment.date,
            time: newAppointment.time,
            services: servicesData.map(s => s.name),
          }
        );
      } catch (emailError) {
        console.error('Email confirmation error:', emailError);
      }
    }

    await session.commitTransaction();
    res.status(201).json({ 
      success: true, 
      appointment: newAppointment
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create appointment error:', error);
    res.status(500).json({ 
      error: 'Error al crear reserva', 
      details: (error as Error).message 
    });
  } finally {
    session.endSession();
  }
};

export const cancelAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    if (appointment.user.toString() !== req.user?.id && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para cancelar esta cita' });
    }

    appointment.status = 'cancelled';
    await appointment.save();
    
    res.status(200).json({ 
      success: true, 
      message: 'Cita cancelada correctamente' 
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ 
      error: 'Error al cancelar cita',
      details: process.env.NODE_ENV === 'development' 
        ? (error as Error).message 
        : undefined
    });
  }
};

export const getUserAppointments = async (req: AuthRequest, res: Response) => {
  try {
    const appointments = await Appointment.find({ user: req.user?.id })
      .populate('services', 'name duration price')
      .sort({ date: 1 }); // Orden ascendente por fecha

    res.status(200).json(appointments);
  } catch (error) {
    console.error('Get user appointments error:', error);
    res.status(500).json({ 
      error: 'Error al obtener citas',
      details: process.env.NODE_ENV === 'development' 
        ? (error as Error).message 
        : undefined
    });
  }
};

function isDateInRange(appointmentDate: Date): boolean {
  const today = new Date();
  const maxDate = new Date();
  maxDate.setMonth(today.getMonth() + MAX_BOOKING_MONTHS);
  return appointmentDate >= today && appointmentDate <= maxDate;
}

