import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.emailUser,
    pass: config.emailPassword
  }
});

/**
 * Formato de fecha para emails
 */
const formatDate = (date: Date): string => {
  return format(date, 'EEEE, d MMMM yyyy', { locale: es });
};

/**
 * Envía un código de recuperación de contraseña
 */
export const sendResetCode = async (email: string, code: string) => {
  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: 'Código de recuperación de contraseña',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #B45309;">Recuperación de Contraseña</h2>
        <p>Has solicitado restablecer tu contraseña. Usa el siguiente código para continuar:</p>
        <div style="background-color: #F3F4F6; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #B45309; font-size: 32px; letter-spacing: 5px;">${code}</h1>
        </div>
        <p>Este código expirará en 30 minutos.</p>
        <p>Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía un código para registrarse como administrador
 */
export const sendAdminCodeEmail = async (
  superadminEmail: string,
  code: string,
  userEmail: string // Email del usuario que solicita ser admin
) => {
  const mailOptions = {
    from: config.emailFrom,
    to: superadminEmail,
    subject: 'Código de Registro de Administrador',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #B45309;">Solicitud de Registro como Administrador</h2>
        <p>El usuario <strong>${userEmail}</strong> ha solicitado registrarse como administrador.</p>
        <p>Usa el siguiente código para autorizar el registro:</p>
        <div style="background-color: #F3F4F6; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #B45309; font-size: 32px; letter-spacing: 5px;">${code}</h1>
        </div>
        <p>Este código expirará en 30 minutos.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía un código de verificación de email
 */
export const sendVerificationCode = async (email: string, code: string) => {
  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: 'Código de Verificación de Correo Electrónico',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #B45309;">Verificación de Correo Electrónico</h2>
        <p>Gracias por registrarte. Usa el siguiente código para verificar tu correo electrónico:</p>
        <div style="background-color: #F3F4F6; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #B45309; font-size: 32px; letter-spacing: 5px;">${code}</h1>
        </div>
        <p>Este código expirará en 30 minutos.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía una confirmación de cita
 */
export const sendBookingConfirmation = async (
  email: string, 
  appointment: { 
    date: Date; 
    time: string; 
    services: string[];
    userName: string;
  }
) => {
  const formattedDate = formatDate(appointment.date);
  const servicesList = appointment.services.map(s => `• ${s}`).join('<br>');

  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: '✅ Confirmación de Reserva - Peluquería',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #B45309; text-align: center;">¡Reserva Confirmada!</h2>
        
        <p>Hola ${appointment.userName},</p>
        
        <p>Tu cita ha sido confirmada exitosamente. Aquí están los detalles:</p>
        
        <div style="background-color: #F9F9F9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Fecha:</strong> ${formattedDate}</p>
          <p><strong>Hora:</strong> ${appointment.time}</p>
          <p><strong>Servicios:</strong><br>${servicesList}</p>
        </div>
        
        <p><strong>Recordatorio:</strong> Por favor, llega 5-10 minutos antes de tu cita. Si necesitas cancelar o reprogramar, hazlo con al menos 24 horas de anticipación.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <p>¡Gracias por elegirnos! Esperamos verte pronto.</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía una notificación de cancelación de cita
 */
export const sendCancellationNotification = async (
  email: string, 
  data: { 
    date: Date; 
    time: string; 
    lateCancellation: boolean;
    userName: string;
  }
) => {
  const formattedDate = formatDate(data.date);

  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: 'Cita Cancelada - Peluquería',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #B45309; text-align: center;">Cita Cancelada</h2>
        
        <p>Hola ${data.userName},</p>
        
        <p>Te confirmamos que tu cita ha sido cancelada:</p>
        
        <div style="background-color: #F9F9F9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Fecha:</strong> ${formattedDate}</p>
          <p><strong>Hora:</strong> ${data.time}</p>
        </div>
        
        ${data.lateCancellation ? `
          <div style="background-color: #FEF3F2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #DC2626;">
            <p><strong>Nota:</strong> Esta cancelación se ha realizado con menos de 24 horas de anticipación. Te recordamos que las cancelaciones con poca antelación pueden estar sujetas a nuestra política de cancelación.</p>
          </div>
        ` : ''}
        
        <p>Si deseas programar una nueva cita, puedes hacerlo a través de nuestra aplicación o contactándonos directamente.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <p>Gracias por tu comprensión.</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía una notificación de reprogramación de cita
 */
export const sendReschedulingNotification = async (
  email: string, 
  data: { 
    oldDate: Date; 
    oldTime: string;
    newDate: Date;
    newTime: string;
    services: string[];
    userName: string;
  }
) => {
  const formattedOldDate = formatDate(data.oldDate);
  const formattedNewDate = formatDate(data.newDate);
  const servicesList = data.services.map(s => `• ${s}`).join('<br>');

  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: 'Cita Reprogramada - Peluquería',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #B45309; text-align: center;">Cita Reprogramada</h2>
        
        <p>Hola ${data.userName},</p>
        
        <p>Te confirmamos que tu cita ha sido reprogramada con éxito.</p>
        
        <div style="background-color: #FFF7ED; padding: 15px; border-radius: 5px; margin: 20px 0; text-decoration: line-through;">
          <h3 style="color: #9CA3AF; margin-top: 0;">Cita Original</h3>
          <p style="color: #9CA3AF;"><strong>Fecha:</strong> ${formattedOldDate}</p>
          <p style="color: #9CA3AF;"><strong>Hora:</strong> ${data.oldTime}</p>
        </div>
        
        <div style="background-color: #ECFDF5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10B981;">
          <h3 style="color: #10B981; margin-top: 0;">Nueva Cita</h3>
          <p><strong>Fecha:</strong> ${formattedNewDate}</p>
          <p><strong>Hora:</strong> ${data.newTime}</p>
          <p><strong>Servicios:</strong><br>${servicesList}</p>
        </div>
        
        <p><strong>Recordatorio:</strong> Por favor, llega 5-10 minutos antes de tu cita. Si necesitas cancelar o reprogramar nuevamente, hazlo con al menos 24 horas de anticipación.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <p>¡Gracias por tu preferencia! Esperamos verte pronto.</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía una notificación de reprogramación automática por conflicto de cita
 */
export const sendConflictReschedulingNotification = async (
  email: string, 
  data: { 
    oldDate: Date; 
    oldTime: string;
    newDate: Date;
    newTime: string;
    services: string[];
    userName: string;
  }
) => {
  const formattedOldDate = formatDate(data.oldDate);
  const formattedNewDate = formatDate(data.newDate);
  const servicesList = data.services.map(s => `• ${s}`).join('<br>');

  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: '⚠️ Cita Reprogramada Automáticamente - Peluquería',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #B45309; text-align: center;">Cita Reprogramada Automáticamente</h2>
        
        <p>Hola ${data.userName},</p>
        
        <div style="background-color: #FEF3F2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #F59E0B;">
          <p><strong>Aviso importante:</strong> Tu cita fue reservada simultáneamente por otro cliente. Para evitar conflictos, nuestro sistema ha reprogramado automáticamente tu cita.</p>
        </div>
        
        <div style="background-color: #FFF7ED; padding: 15px; border-radius: 5px; margin: 20px 0; text-decoration: line-through;">
          <h3 style="color: #9CA3AF; margin-top: 0;">Cita Original</h3>
          <p style="color: #9CA3AF;"><strong>Fecha:</strong> ${formattedOldDate}</p>
          <p style="color: #9CA3AF;"><strong>Hora:</strong> ${data.oldTime}</p>
        </div>
        
        <div style="background-color: #ECFDF5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10B981;">
          <h3 style="color: #10B981; margin-top: 0;">Nueva Cita</h3>
         <p><strong>Fecha:</strong> ${formattedNewDate}</p>
          <p><strong>Hora:</strong> ${data.newTime}</p>
          <p><strong>Servicios:</strong><br>${servicesList}</p>
        </div>
        
        <p>Si esta nueva fecha y hora no son convenientes para ti, puedes reprogramar o cancelar a través de nuestra aplicación.</p>
        
        <p><strong>Recordatorio:</strong> Por favor, llega 5-10 minutos antes de tu cita. Si necesitas cancelar o reprogramar nuevamente, hazlo con al menos 24 horas de anticipación.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <p>Lamentamos cualquier inconveniente que esto pueda causarte. ¡Gracias por tu comprensión!</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía un recordatorio de cita
 */
export const sendAppointmentReminder = async (
  email: string, 
  data: { 
    date: Date; 
    time: string; 
    services: string[];
    userName: string;
  }
) => {
  const formattedDate = formatDate(data.date);
  const servicesList = data.services.map(s => `• ${s}`).join('<br>');

  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: '⏰ Recordatorio de Cita - Peluquería',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #B45309; text-align: center;">Recordatorio de Cita</h2>
        
        <p>Hola ${data.userName},</p>
        
        <p>Te recordamos que tienes una cita programada para mañana:</p>
        
        <div style="background-color: #F9F9F9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Fecha:</strong> ${formattedDate}</p>
          <p><strong>Hora:</strong> ${data.time}</p>
          <p><strong>Servicios:</strong><br>${servicesList}</p>
        </div>
        
        <p><strong>Recuerda:</strong> Llegar 5-10 minutos antes de tu cita. Si necesitas cancelar, por favor hazlo con al menos 24 horas de anticipación.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <p>¡Esperamos verte pronto!</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Envía una notificación de cambio en el horario del local
 */
export const sendScheduleChangeNotification = async (
  email: string, 
  data: { 
    date: Date; 
    time: string;
    services: string[];
    reason: string;
    userName: string;
  }
) => {
  const formattedDate = formatDate(data.date);
  const servicesList = data.services.map(s => `• ${s}`).join('<br>');

  const mailOptions = {
    from: config.emailFrom,
    to: email,
    subject: '⚠️ Importante: Cambio en tu Cita - Peluquería',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #B45309; text-align: center;">Cancelación de Cita</h2>
        
        <p>Hola ${data.userName},</p>
        
        <div style="background-color: #FEF3F2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #DC2626;">
          <p><strong>Aviso Importante:</strong> Debido a ${data.reason}, tu cita ha sido cancelada.</p>
        </div>
        
        <p>Detalles de la cita cancelada:</p>
        
        <div style="background-color: #F9F9F9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Fecha:</strong> ${formattedDate}</p>
          <p><strong>Hora:</strong> ${data.time}</p>
          <p><strong>Servicios:</strong><br>${servicesList}</p>
        </div>
        
        <p>Lamentamos las molestias ocasionadas. Por favor, accede a nuestra aplicación para programar una nueva cita en una fecha disponible.</p>
        
        <div style="text-align: center; margin-top: 30px; padding: 15px; background-color: #E0F2FE; border-radius: 5px;">
          <p><strong>¿Cómo programar una nueva cita?</strong></p>
          <p>Inicia sesión en nuestra aplicación > Servicios > Selecciona tus servicios > Reservar cita</p>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <p>Lamentamos los inconvenientes causados. ¡Gracias por tu comprensión!</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};