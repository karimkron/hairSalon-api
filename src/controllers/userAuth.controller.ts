import { Request, Response } from 'express';
import { User } from '../models/User';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { sendVerificationCode } from '../services/email.service';
import { VerificationCode } from '../models/VerificationCode';

// Función para registrar un nuevo usuario (rol user)
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: 'Ya existe una cuenta con este correo electrónico',
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear nuevo usuario con rol 'user'
    const user = new User({
      email,
      password: hashedPassword,
      name,
      phone,
      role: 'user', // Rol fijo para usuarios normales
    });

    await user.save();

    // Generar código de verificación
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = new Date(Date.now() + 30 * 60000); // 30 minutos

    // Guardar el código en la colección verificationcodes
    await VerificationCode.findOneAndUpdate(
      { email: user.email },
      { code: verificationCode, expiresAt: verificationCodeExpires },
      { upsert: true, new: true }
    );

    // Enviar el código por email
    await sendVerificationCode(email, verificationCode);

    // Crear token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    // Enviar respuesta sin incluir la contraseña
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      points: user.points,
      role: user.role,
    };

    res.status(201).json({
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Error en registro de usuario:', error);
    res.status(500).json({
      message: 'Error durante el registro. Por favor intenta nuevamente.',
    });
  }
};