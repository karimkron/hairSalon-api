import { Request, Response } from 'express';
import { Schedule } from '../models/Schedule';
import { scheduleService } from '../services/schedule.service';
import { AuthRequest } from '../types/request';

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
    const normalizedRegularHours: Record<string, any> = {};
    Object.entries(schedule.regularHours).forEach(([dayName, schedule]) => {
      const normalizedDay = dayName.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      normalizedRegularHours[normalizedDay] = schedule;
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

export const updateSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const { regularHours, specialDays } = req.body;
    
    // Verificar permisos (solo administradores pueden actualizar el horario)
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permiso para actualizar el horario' 
      });
    }

    // Normalizar nombres de días en regularHours
    const normalizedRegularHours: Record<string, any> = {};
    Object.entries(regularHours).forEach(([dayName, schedule]) => {
      const normalizedDay = dayName.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      normalizedRegularHours[normalizedDay] = schedule;
    });

    // Procesar specialDays (convertir strings de fecha a Date)
    const previousSchedule = await Schedule.findOne();
    const existingSpecialDays = previousSchedule?.specialDays || [];
    
    // Array para almacenar fechas que necesitan procesamiento de citas
    const daysToProcess = [];
    
    for (const newDay of specialDays) {
      const newDayDate = new Date(newDay.date);
      const existingDay = existingSpecialDays.find(d => {
        return d.date.toISOString().split('T')[0] === newDayDate.toISOString().split('T')[0];
      });
      
      // Si es un día nuevo o hay un cambio de "closed", procesamos citas afectadas
      if (!existingDay || existingDay.schedule.closed !== newDay.schedule.closed) {
        daysToProcess.push({
          date: newDayDate,
          isClosed: newDay.schedule.closed,
          reason: newDay.reason || 'Cambio en el horario de la peluquería'
        });
      }
    }
    
    const processedSpecialDays = specialDays.map((day: any) => ({
      ...day,
      date: new Date(day.date),
      schedule: {
        ...day.schedule,
        // Solo asignar valores si el día no está cerrado
        ...(!day.schedule.closed && { 
          openingAM: day.schedule.openingAM || "00:00",
          closingAM: day.schedule.closingAM || "00:00",
          openingPM: day.schedule.openingPM || undefined,
          closingPM: day.schedule.closingPM || undefined,
        }), 
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
        setDefaultsOnInsert: false,
        runValidators: true
      }
    ).lean();

    // Procesar las citas afectadas por cambios de horario
    const processedDays = [];
    for (const day of daysToProcess) {
      try {
        if (day.isClosed) {
          const result = await scheduleService.processScheduleChange(
            day.date, 
            day.isClosed, 
            day.reason
          );
          
          processedDays.push({
            date: day.date.toISOString().split('T')[0],
            affectedAppointments: result.affectedAppointments,
            message: result.message
          });
        }
      } catch (processError) {
        console.error(`Error procesando citas para el día ${day.date}:`, processError);
        // Continuamos con el siguiente día aunque haya errores
      }
    }

    // Formatear la respuesta
    const response = {
      ...updatedSchedule,
      regularHours: normalizedRegularHours, // Devolver días normalizados
      specialDays: updatedSchedule?.specialDays.map(day => ({
        ...day,
        date: day.date.toISOString().split('T')[0]
      })),
      processedDays // Incluir información sobre días procesados
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