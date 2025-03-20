import { Request, Response } from 'express';
import { User } from '../models/User';
import { VerificationCode } from '../models/VerificationCode';
import { sendVerificationCode } from '../services/email.service';

// Función para enviar el código de verificación
export const sendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Generar código aleatorio de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 30 * 60000); // 30 minutos

    // Guardar el código en la colección verificationcodes
    await VerificationCode.findOneAndUpdate(
      { email },
      { code, expiresAt },
      { upsert: true, new: true }
    );

    // Enviar el código por email (usando tu servicio de email)
    await sendVerificationCode(email, code);

    res.json({ message: 'Código de verificación enviado al correo electrónico.' });
  } catch (error) {
    console.error('Error al enviar el código de verificación:', error);
    res.status(500).json({ message: 'Error al enviar el código de verificación.' });
  }
};

export const verifyCode = async (req: Request, res: Response) => {
  const { email, code } = req.body;

  // Validación de campos faltantes
  if (!email || !code) {
    const missingFields = [];
    if (!email) missingFields.push('email');
    if (!code) missingFields.push('code');

    console.error('Faltan datos en la solicitud:', { email, code });
    return res.status(400).json({
      message: `Faltan los siguientes datos: ${missingFields.join(', ')}. Por favor, proporciona toda la información requerida.`,
    });
  }

  try {
    // Buscar el código en la colección verificationcodes
    const verificationCode = await VerificationCode.findOne({ email });

    // Si no se encuentra el código para el email proporcionado
    if (!verificationCode) {
      console.error('Código no encontrado para el email:', { email, códigoRecibido: code });
      return res.status(400).json({
        message: 'No se encontró un código de verificación para este email. Por favor, solicita un nuevo código.',
      });
    }

    // Verificar si el código ha expirado
    const now = new Date();
    if (verificationCode.expiresAt < now) {
      console.error('Código expirado:', {
        email,
        códigoRecibido: code,
        códigoAlmacenado: verificationCode.code,
        expiración: verificationCode.expiresAt,
        fechaActual: now,
      });
      return res.status(400).json({
        message: 'El código de verificación ha expirado. Por favor, solicita un nuevo código.',
        detalles: {
          expiración: verificationCode.expiresAt,
          fechaActual: now,
        },
      });
    }

    // Verificar si el código coincide
    if (verificationCode.code !== code) {
      console.error('Código incorrecto:', {
        email,
        códigoRecibido: code,
        códigoAlmacenado: verificationCode.code,
      });
      return res.status(400).json({
        message: 'El código de verificación es incorrecto. Por favor, verifica el código e intenta nuevamente.',
      });
    }

    // Marcar al usuario como verificado en la colección users
    await User.findOneAndUpdate({ email }, { isVerified: true });

    // Eliminar el código usado de la colección verificationcodes
    await VerificationCode.deleteOne({ email });

    console.log('Código verificado correctamente:', { email, code });
    return res.json({
      message: 'Correo electrónico verificado correctamente.',
      detalles: { email, códigoVerificado: code },
    });
  } catch (error) {
    console.error('Error al verificar el código:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
      datosRecibidos: { email, code },
    });
    return res.status(500).json({
      message: 'Ocurrió un error interno al verificar el código. Por favor, intenta nuevamente más tarde.',
      detalles: {
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
    });
  }
};