import mongoose from "mongoose";

interface DailySchedule {
  closed: boolean;
  openingAM?: string;
  closingAM?: string;
  openingPM?: string;
  closingPM?: string;
}

interface SpecialDay {
  date: Date;
  schedule: DailySchedule;
}

export interface ISchedule extends mongoose.Document {
  regularHours: {
    lunes: DailySchedule;
    martes: DailySchedule;
    miercoles: DailySchedule;
    jueves: DailySchedule;
    viernes: DailySchedule;
    sabado: DailySchedule;
    domingo: DailySchedule;
  };
  specialDays: SpecialDay[];
}

const dailyScheduleSchema = new mongoose.Schema<DailySchedule>({
  closed: { type: Boolean, required: true, default: false },
  openingAM: { type: String },
  closingAM: { type: String },
  openingPM: { type: String },
  closingPM: { type: String },
});

const specialDaySchema = new mongoose.Schema<SpecialDay>({
  date: { type: Date, required: true },
  schedule: { type: dailyScheduleSchema, required: true },
});

const scheduleSchema = new mongoose.Schema<ISchedule>({
  regularHours: {
    lunes: { type: dailyScheduleSchema, required: true },
    martes: { type: dailyScheduleSchema, required: true },
    miercoles: { type: dailyScheduleSchema, required: true },
    jueves: { type: dailyScheduleSchema, required: true },
    viernes: { type: dailyScheduleSchema, required: true },
    sabado: { type: dailyScheduleSchema, required: true },
    domingo: { type: dailyScheduleSchema, required: true },
  },
  specialDays: [specialDaySchema],
});

export const Schedule = mongoose.model<ISchedule>("Schedule", scheduleSchema);
