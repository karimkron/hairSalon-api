import mongoose from 'mongoose';

interface IAppointment extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  services: mongoose.Types.ObjectId[];
  date: Date;
  time: string;
  totalDuration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'needsRescheduling';
  notes: string;
  cancellationReason?: string;
  cancelledAt?: Date;
  reminderSent: boolean;
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
  version?: number; // Número de versión para control de concurrencia
}

const appointmentSchema = new mongoose.Schema<IAppointment>({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    immutable: true
  },
  services: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Service', 
    required: true
  }],
  date: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(value: Date) {
        return value >= new Date(new Date().setHours(0, 0, 0, 0));
      },
      message: 'La fecha de la cita no puede estar en el pasado'
    }
  },
  time: { 
    type: String, 
    required: true,
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de hora inválido']
  },
  totalDuration: { 
    type: Number, 
    required: true,
    min: [1, 'La duración debe ser de al menos 1 minuto'],
    max: [480, 'La duración máxima de una cita es de 8 horas']
  },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'needsRescheduling'],
    default: 'pending'
  },
  notes: {
    type: String,
    default: ''
  },
  cancellationReason: {
    type: String
  },
  cancelledAt: {
    type: Date
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  reminderSentAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: { updatedAt: true }, // Actualizar automáticamente updatedAt
  optimisticConcurrency: true // Habilitar control de concurrencia optimista
});

// Índices para mejorar el rendimiento en consultas comunes
appointmentSchema.index({ date: 1, time: 1 });
appointmentSchema.index({ user: 1, date: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ reminderSent: 1, date: 1 });

// Índice único para prevenir citas duplicadas en la misma fecha y hora
// Este índice garantiza que no puede haber dos citas activas para el mismo horario
// Se excluyen las citas canceladas para permitir reutilizar el horario
appointmentSchema.index(
  { 
    date: 1, 
    time: 1,
    status: 1 
  }, 
  { 
    unique: true, 
    partialFilterExpression: { status: { $nin: ['cancelled'] } },
    name: 'date_time_status_unique' // Nombre explícito para el índice
  }
);

// Pre-save hook para incrementar la versión
appointmentSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.version = (this.version || 0) + 1;
  }
  next();
});

// Método virtual para fecha y hora completas
appointmentSchema.virtual('dateTime').get(function() {
  if (!this.date || !this.time) return null;
  
  const [hours, minutes] = this.time.split(':').map(Number);
  const dateTime = new Date(this.date);
  dateTime.setHours(hours, minutes, 0, 0);
  
  return dateTime;
});

// Método para verificar si una cita está próxima (menos de 24 horas)
appointmentSchema.methods.isUpcoming = function(hoursThreshold = 24): boolean {
  const appointmentDate = this.dateTime;
  if (!appointmentDate) return false;
  
  const now = new Date();
  const hoursDifference = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  return hoursDifference > 0 && hoursDifference <= hoursThreshold;
};

// Método para verificar si una cita ya pasó
appointmentSchema.methods.hasPassed = function(): boolean {
  const appointmentDate = this.dateTime;
  if (!appointmentDate) return false;
  
  return appointmentDate < new Date();
};

export const Appointment = mongoose.model<IAppointment>('Appointment', appointmentSchema);