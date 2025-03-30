import { Response, Request } from 'express';
import { Schedule, ISchedule } from '../models/Schedule';
import { Appointment } from '../models/Appointment';

const MAX_BOOKING_MONTHS = 2;
const SLOT_DURATION = 30;

// Helper para normalizar nombres de días con zona horaria y sin acentos
export const normalizeDayName = (date: Date): string => {
  const adjustedDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const options = { 
    weekday: 'long' as const, 
    timeZone: 'Europe/Madrid' 
  };
  
  const day = adjustedDate.toLocaleDateString('es-ES', options)
    .toLowerCase()
    .replace('miércoles', 'miercoles')
    .replace('sábado', 'sabado')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return day;
};

// Función para detectar días cerrados con mejor validación para días especiales
const isDayClosed = (date: Date, schedule: ISchedule): boolean => {
  // Obtener la fecha en formato ISO para comparar con días especiales
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const dateString = localDate.toISOString().split('T')[0];
  
  console.log(`Verificando si el día ${dateString} está cerrado`);
  
  // Verificar días especiales con una comparación más precisa
  const specialDay = schedule.specialDays.find(specialDay => {
    const specialDateString = new Date(specialDay.date)
      .toISOString()
      .split('T')[0];
    return specialDateString === dateString;
  });

  if (specialDay) {
    console.log(`Día especial encontrado: ${dateString}, cerrado: ${specialDay.schedule.closed}`);
    return specialDay.schedule.closed;
  }

  // Verificar horario regular
  const dayName = normalizeDayName(localDate) as keyof typeof schedule.regularHours;
  const daySchedule = schedule.regularHours[dayName];
  
  const isClosed = daySchedule?.closed || false;
  console.log(`Día regular: ${dayName}, cerrado: ${isClosed}`);
  
  return isClosed;
};

// Función para obtener el horario específico para una fecha (puede ser un día especial o regular)
const getScheduleForDate = (date: Date, schedule: ISchedule): ISchedule['regularHours'][keyof ISchedule['regularHours']] | null => {
  // Obtener la fecha en formato ISO para comparar con días especiales
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const dateString = localDate.toISOString().split('T')[0];
  
  // Verificar si es un día especial
  const specialDay = schedule.specialDays.find(specialDay => {
    const specialDateString = new Date(specialDay.date)
      .toISOString()
      .split('T')[0];
    return specialDateString === dateString;
  });

  if (specialDay) {
    console.log(`Encontrado día especial para ${dateString}, usando su configuración específica`);
    return specialDay.schedule;
  }

  // Si no es un día especial, usar el horario regular
  const dayName = normalizeDayName(localDate) as keyof typeof schedule.regularHours;
  const daySchedule = schedule.regularHours[dayName];
  
  return daySchedule || null;
};

// Generar slots con validación de horarios
export const generateTimeSlots = (
daySchedule: ISchedule['regularHours'][keyof ISchedule['regularHours']], totalDuration?: number): string[] => {
  if (!daySchedule || daySchedule.closed) return [];
  
  const parseTime = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const slots: string[] = [];
  const addSlots = (start: string, end: string) => {
    const startTime = parseTime(start);
    const endTime = parseTime(end);
    let current = startTime;

    while (current <= endTime - SLOT_DURATION) {
      const hours = Math.floor(current / 60).toString().padStart(2, '0');
      const minutes = (current % 60).toString().padStart(2, '0');
      slots.push(`${hours}:${minutes}`);
      current += SLOT_DURATION;
    }
  };

  // Horario continuo o con descanso
  if (daySchedule.openingAM && daySchedule.closingAM) {
    addSlots(daySchedule.openingAM, daySchedule.closingAM);
  }
  if (daySchedule.openingPM && daySchedule.closingPM) {
    addSlots(daySchedule.openingPM, daySchedule.closingPM);
  }

  return slots;
};

// Generar rango de fechas ajustado a zona horaria
const getDateRange = (months: number): Date[] => {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const spainOffset = 120; // UTC+2
  const spainToday = new Date(today.getTime() + spainOffset * 60 * 1000);
  const endDate = new Date(spainToday);
  endDate.setMonth(endDate.getMonth() + months);
  endDate.setDate(endDate.getDate() + 1);

  for (let d = new Date(spainToday); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
};

// Controlador principal (mejorado)
export const getFullAvailability = async (req: Request, res: Response) => {
  console.log('Solicitando disponibilidad completa');
  
  try {
    const allDates = getDateRange(MAX_BOOKING_MONTHS);
    
    // Asegurarse de obtener la información más actualizada
    const [schedule, appointments] = await Promise.all([
      Schedule.findOne().lean<ISchedule>(),
      Appointment.find({
        date: { 
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setMonth(new Date().getMonth() + MAX_BOOKING_MONTHS))
        },
        status: { $ne: 'cancelled' }
      }).lean()
    ]);

    if (!schedule) {
      console.warn('No se encontró configuración de horario');
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    console.log(`Horario cargado con ${schedule.specialDays.length} días especiales`);
    
    // Log de días especiales para depuración
    schedule.specialDays.forEach(specialDay => {
      console.log(`Día especial: ${new Date(specialDay.date).toISOString().split('T')[0]}, cerrado: ${specialDay.schedule.closed}`);
    });

    const bookedSlots = appointments.reduce((map, appointment) => {
      const dateKey = new Date(appointment.date).toISOString().split('T')[0];
      map.set(dateKey, (map.get(dateKey) || new Set()).add(appointment.time));
      return map;
    }, new Map<string, Set<string>>());

    console.log(`Procesando ${allDates.length} fechas para disponibilidad`);

    const availability = allDates.map(date => {
      const localDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
      const dateKey = localDate.toISOString().split('T')[0];
      const closed = isDayClosed(localDate, schedule);
      
      // Solo generar slots si el día no está cerrado
      let slots: string[] = [];
      if (!closed) {
        // Obtener el horario específico para esta fecha (puede ser regular o especial)
        const daySchedule = getScheduleForDate(localDate, schedule);
        if (daySchedule) {
          console.log(`Generando slots para ${dateKey}:`, 
                     `AM: ${daySchedule.openingAM}-${daySchedule.closingAM}`, 
                     `PM: ${daySchedule.openingPM || 'N/A'}-${daySchedule.closingPM || 'N/A'}`);
          slots = generateTimeSlots(daySchedule);
        }
      }

      // Verificar slots disponibles
      const isOpen = !closed && slots.length > 0;
      
      return {
        date: dateKey,
        isOpen: isOpen,
        message: isOpen ? 'Disponible' : 'Cerrado',
        slots: slots.map(slot => ({
          time: slot,
          available: !bookedSlots.get(dateKey)?.has(slot)
        }))
      };
    });

    // Filtrar fechas pasadas
    const filteredAvailability = availability.filter(day => 
      new Date(day.date) >= new Date(new Date().setHours(0, 0, 0, 0))
    );

    console.log(`Enviando disponibilidad para ${filteredAvailability.length} días`);
    return res.json(filteredAvailability);

  } catch (error) {
    console.error('Error en disponibilidad:', error);
    return res.status(500).json({
      error: 'Error interno',
      ...(process.env.NODE_ENV === 'development' && { 
        details: error instanceof Error ? error.message : 'Error desconocido'
      })
    });
  }
};