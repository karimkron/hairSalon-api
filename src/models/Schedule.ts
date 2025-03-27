import mongoose from 'mongoose';

interface IDailySchedule {
  openingAM: string;
  closingAM: string;
  openingPM?: string;
  closingPM?: string;
  closed: boolean;
}

interface ISpecialDay {
  date: Date;
  reason: string;
  schedule: IDailySchedule;
}

interface ISchedule {
  regularHours: {
    [key: string]: IDailySchedule; // Lunes, Martes..., Domingo
  };
  specialDays: ISpecialDay[];
}

const dailyScheduleSchema = new mongoose.Schema<IDailySchedule>({
  openingAM: { type: String, required: true },
  closingAM: { type: String, required: true },
  openingPM: String,
  closingPM: String,
  closed: { type: Boolean, default: false }
});

const specialDaySchema = new mongoose.Schema<ISpecialDay>({
  date: { type: Date, required: true },
  reason: { type: String, required: true },
  schedule: dailyScheduleSchema
});

const scheduleSchema = new mongoose.Schema<ISchedule>({
  regularHours: {
    type: Map,
    of: dailyScheduleSchema,
    required: true
  },
  specialDays: [specialDaySchema]
});

export const Schedule = mongoose.model<ISchedule>('Schedule', scheduleSchema);