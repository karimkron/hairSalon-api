import mongoose from 'mongoose';

// Extended interface to include validation methods
interface IAppointment extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  services: mongoose.Types.ObjectId[];
  date: Date;
  time: string;
  totalDuration: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  
  // Optional method for custom validation
  validateAppointmentDate(): boolean;
}

const appointmentSchema = new mongoose.Schema<IAppointment>({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    immutable: true, // Prevent changing the user after creation
    onDelete: 'cascade' // Cascade delete related appointments
  },
  services: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Service', 
    required: true,
    onDelete: 'cascade' // Cascade delete if service is removed
  }],
  date: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(value: Date) {
        // Ensure date is not in the past
        return value >= new Date(new Date().setHours(0, 0, 0, 0));
      },
      message: 'Appointment date cannot be in the past'
    }
  },
  time: { 
    type: String, 
    required: true,
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:MM (24-hour format)'],
    validate: {
      validator: function(value: string) {
        // Optional: Add additional time validation if needed
        const [hours, minutes] = value.split(':').map(Number);
        return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
      },
      message: 'Invalid time'
    }
  },
  totalDuration: { 
    type: Number, 
    required: true,
    min: [1, 'Duration must be at least 1 minute'],
    max: [480, 'Maximum appointment duration is 8 hours (480 minutes)']
  },
  status: { 
    type: String, 
    enum: {
      values: ['pending', 'confirmed', 'cancelled'],
      message: '{VALUE} is not a valid status'
    }, 
    default: 'pending',
    required: true
  }
}, {
  timestamps: true, // Automatically add createdAt and updatedAt fields
  optimisticConcurrency: true // Enable optimistic locking
});

// Compound index for efficient querying
appointmentSchema.index({ date: 1, time: 1 });
appointmentSchema.index({ user: 1, date: 1 });
appointmentSchema.index({ status: 1, date: 1 });

// Pre-save middleware for additional validation
appointmentSchema.pre('save', function(next) {
  // Example: Prevent booking conflicting appointments
  this.validateAppointmentDate();
  next();
});

// Method to validate appointment date and time
appointmentSchema.methods.validateAppointmentDate = function() {
  // Additional custom validation logic can be added here
  if (this.date < new Date()) {
    throw new Error('Appointment cannot be scheduled in the past');
  }
  return true;
};

// Create the model with type safety
export const Appointment = mongoose.model<IAppointment>('Appointment', appointmentSchema);