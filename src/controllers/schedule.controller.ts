import { Request, Response } from 'express';
import { Schedule } from '../models/Schedule';

interface DailySchedule {
  openingAM: string;
  closingAM: string;
  openingPM?: string;
  closingPM?: string;
  closed: boolean;
}

interface SpecialDay {
  date: Date;
  reason: string;
  schedule: DailySchedule;
}

// Función para normalizar nombres de días (ej: "Miércoles" → "miercoles")
const normalizeDayName = (dayName: string): string => {
  return dayName.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/sábado/g, "sabado")
    .replace(/domingo/g, "domingo");
};

export const getSchedule = async (req: Request, res: Response) => {
  try {
    const schedule = await Schedule.findOne().lean();
    
    if (!schedule) {
      return res.status(200).json({
        regularHours: {},
        specialDays: []
      });
    }

    // Normalizar nombres de días en regularHours
    const normalizedRegularHours: Record<string, DailySchedule> = {};
    Object.entries(schedule.regularHours).forEach(([dayName, schedule]) => {
      const normalizedDay = normalizeDayName(dayName);
      normalizedRegularHours[normalizedDay] = schedule as DailySchedule;
    });

    // Formatear fechas en specialDays
    const formattedSchedule = {
      ...schedule,
      regularHours: normalizedRegularHours,
      specialDays: schedule.specialDays.map(day => ({
        ...day,
        date: day.date.toISOString().split('T')[0]
      }))
    };

    res.status(200).json(formattedSchedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener el horario' 
    });
  }
};

export const updateSchedule = async (req: Request, res: Response) => {
  try {
    const { regularHours, specialDays } = req.body;

    // Normalizar nombres de días en regularHours antes de guardar
    const normalizedRegularHours: Record<string, DailySchedule> = {};
    Object.entries(regularHours).forEach(([dayName, schedule]) => {
      const normalizedDay = normalizeDayName(dayName);
      normalizedRegularHours[normalizedDay] = schedule as DailySchedule;
    });

    // Procesar specialDays (convertir strings de fecha a Date)
    const processedSpecialDays = specialDays.map((day: any) => ({
      ...day,
      date: new Date(day.date),
      schedule: {
        ...day.schedule,
        openingAM: day.schedule.openingAM || "00:00",
        closingAM: day.schedule.closingAM || "00:00",
        openingPM: day.schedule.openingPM || undefined,
        closingPM: day.schedule.closingPM || undefined,
        closed: day.schedule.closed || false
      }
    }));

    // Actualizar o crear el horario
    const updatedSchedule = await Schedule.findOneAndUpdate(
      {},
      {
        regularHours: normalizedRegularHours,
        specialDays: processedSpecialDays
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    // Formatear la respuesta
    const response = {
      ...updatedSchedule,
      regularHours: normalizedRegularHours, // Devolver días normalizados
      specialDays: updatedSchedule?.specialDays.map(day => ({
        ...day,
        date: day.date.toISOString().split('T')[0]
      }))
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el horario',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};