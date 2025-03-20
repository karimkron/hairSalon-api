import { Request, Response } from 'express';
import { User } from '../models/User';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { ResetCode } from '../models/ResetCode';
import { sendResetCode } from '../services/email.service';

// Función para registrar un nuevo usuario
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, role } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: 'Ya existe una cuenta con este correo electrónico',
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear nuevo usuario
    const user = new User({
      email,
      password: hashedPassword,
      name,
      phone,
      role: role || 'user', // Asignar el rol (por defecto 'user')
    });

    await user.save();

    // Crear token
    const token = jwt.sign(
      { userId: user._id, role: user.role }, // Incluimos el rol en el token
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
      role: user.role, // Incluimos el rol en la respuesta
    };

    res.status(201).json({
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      message: 'Error durante el registro. Por favor intenta nuevamente.',
    });
  }
};

// Función para iniciar sesión
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Buscar usuario
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        message: 'No existe ninguna cuenta con este correo electrónico',
      });
    }

    // Verificar si la cuenta está bloqueada
    if (user.isBlocked) {
      // Buscar el correo del superadmin
      const superadmin = await User.findOne({ role: 'superadmin' });
      const superadminEmail = superadmin ? superadmin.email : 'soporte@peluqueria.com';

      return res.status(403).json({
        message: `Tu cuenta ha sido bloqueada. Contacta con el soporte: ${superadminEmail}`,
      });
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({
        message: 'Contraseña incorrecta',
      });
    }

    // Verificar el rol del usuario
    if (req.path.includes('/admin/login')) {
      // Si es el login de administradores, solo permitir admin y superadmin
      if (user.role !== 'admin' && user.role !== 'superadmin') {
        return res.status(403).json({
          message: 'Solo los administradores pueden iniciar sesión aquí.',
        });
      }
    } else {
      // Si es el login de usuarios, solo permitir user
      if (user.role !== 'user') {
        return res.status(403).json({
          message: 'Por favor, inicia sesión desde el panel de administradores.',
        });
      }
    }

    // Crear token
    const token = jwt.sign(
      { userId: user._id, role: user.role }, // Incluimos el rol en el token
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    // Enviar respuesta con el usuario y el token
    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        points: user.points,
        role: user.role, // Incluimos el rol en la respuesta
      },
      token,
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      message: 'Error durante el inicio de sesión. Por favor intenta nuevamente.',
    });
  }
};

// Función para solicitar un código de recuperación
export const requestResetCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: 'No existe una cuenta con este correo electrónico',
      });
    }

    // Generar código aleatorio de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + config.resetCodeExpiry * 60000);

    // Guardar el código en la base de datos
    await ResetCode.findOneAndUpdate(
      { email },
      { code, expiresAt },
      { upsert: true, new: true }
    );

    // Enviar el código por email
    await sendResetCode(email, code);

    res.json({
      message: 'Se ha enviado un código de recuperación a tu correo electrónico',
    });
  } catch (error) {
    console.error('Error al solicitar recuperación:', error);
    res.status(500).json({
      message: 'Error al procesar la solicitud. Por favor intenta nuevamente.',
    });
  }
};

// Función para verificar el código de recuperación
export const verifyResetCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    const resetCode = await ResetCode.findOne({
      email,
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!resetCode) {
      return res.status(400).json({
        message: 'Código inválido o expirado',
      });
    }

    res.json({
      message: 'Código verificado correctamente',
    });
  } catch (error) {
    console.error('Error al verificar código:', error);
    res.status(500).json({
      message: 'Error al verificar el código. Por favor intenta nuevamente.',
    });
  }
};

// Función para restablecer la contraseña
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, password } = req.body;

    // Verificar el código nuevamente
    const resetCode = await ResetCode.findOne({
      email,
      code,
      expiresAt: { $gt: new Date() }, // Verificar que el código no haya expirado
    });

    if (!resetCode) {
      return res.status(400).json({
        message: 'Código inválido o expirado',
      });
    }

    // Validar la contraseña
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[.,!@#$%^&*]).{6,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: 'La contraseña debe tener al menos 6 caracteres, una mayúscula, un número y un carácter especial.',
      });
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findOneAndUpdate(
      { email },
      { password: hashedPassword }
    );

    // Eliminar el código usado
    await ResetCode.deleteOne({ email });

    res.json({
      message: 'Contraseña actualizada correctamente',
    });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({
      message: 'Error al actualizar la contraseña. Por favor intenta nuevamente.',
    });
  }
};


// Función para registrar un nuevo administrador
export const registerAdmin = async (req: Request, res: Response) => {
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

    // Crear nuevo usuario con rol 'admin' por defecto
    const user = new User({
      email,
      password: hashedPassword,
      name,
      phone,
      role: 'admin', // Asignar automáticamente el rol 'admin'
    });

    await user.save();

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
    console.error('Error en registro de administrador:', error);
    res.status(500).json({
      message: 'Error durante el registro de administrador. Por favor intenta nuevamente.',
    });
  }
};