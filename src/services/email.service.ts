import nodemailer from 'nodemailer';
import { config } from '../config/env';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.emailUser,
    pass: config.emailPassword
  }
});

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