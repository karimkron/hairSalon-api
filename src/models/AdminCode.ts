import mongoose from 'mongoose';

// Definimos la interfaz para el código de autorización
interface IAdminCode {
  email: string;       // Email del usuario que solicita ser administrador
  code: string;        // Código de autorización
  expiresAt: Date;     // Fecha de expiración del código
}

// Creamos el esquema de MongoDB
const adminCodeSchema = new mongoose.Schema<IAdminCode>({
  email: {
    type: String,
    required: [true, 'El email es requerido'], // El email es obligatorio
    unique: true,                             // Solo un código por email
    lowercase: true,                          // Guardar el email en minúsculas
    trim: true,                               // Eliminar espacios en blanco
  },
  code: {
    type: String,
    required: [true, 'El código es requerido'], // El código es obligatorio
  },
  expiresAt: {
    type: Date,
    required: [true, 'La fecha de expiración es requerida'], // La fecha es obligatoria
  },
});

// Creamos el modelo a partir del esquema
export const AdminCode = mongoose.model<IAdminCode>('AdminCode', adminCodeSchema);