import { AdminCode } from '../models/AdminCode';
import { config } from '../config/env';
import { sendAdminCodeEmail, sendResetCode  } from './email.service';
import { User } from '../models/User'; 

// Función para generar un código de autorización
export const generateAdminCode = async (email: string) => {
  try {
    // Paso 1: Buscar al superadmin en la base de datos
    const superadmin = await User.findOne({ role: 'superadmin' });

    if (!superadmin) {
      throw new Error('No hay un superadministrador registrado en el sistema');
    }

    // Paso 2: Obtener el email del superadmin
    const superadminEmail = superadmin.email;

    // Paso 3: Generar el código y guardarlo
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + config.resetCodeExpiry * 60000);

    await AdminCode.findOneAndUpdate(
      { email },
      { code, expiresAt },
      { upsert: true, new: true }
    );

    // Paso 4: Enviar el código al superadmin
    await sendAdminCodeEmail(superadminEmail, code, email);

    return { success: true, message: 'Código enviado al superadmin' };
  } catch (error) {
    console.error('Error al generar el código:', error);
    throw new Error('Error al procesar la solicitud');
  }
};


// Función para verificar un código de autorización
export const verifyAdminCode = async (email: string, code: string) => {
  try {
    // Buscar el código en la base de datos
    const adminCode = await AdminCode.findOne({
      email,
      code,
      expiresAt: { $gt: new Date() }, // Verificar que el código no haya expirado
    });

    if (!adminCode) {
      throw new Error('Código inválido o expirado');
    }

    return { success: true, message: 'Código verificado correctamente' };
  } catch (error) {
    console.error('Error al verificar el código de administrador:', error);
    throw new Error('Error al verificar el código de administrador');
  }
};