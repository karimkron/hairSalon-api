import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User } from '../models/User';

// Extender la interfaz Request de Express
declare module 'express' {
  interface Request {
    user?: {
      id: string;
      role: string;
    };
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No se proporcionó token de autenticación' });
    }

    // Verificar el token y decodificarlo
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string }; // Cambiado a userId
    console.log('Decoded token:', decoded); // Log para depuración

    // Buscar al usuario en la base de datos
    const user = await User.findById(decoded.userId); // Cambiado a userId
    console.log('User found:', user); // Log para depuración

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar si el usuario está bloqueado
    if (user.isBlocked) {
      return res.status(403).json({
        message: 'Tu cuenta ha sido bloqueada. Contacta con el soporte: soporte@peluqueria.com',
      });
    }

    // Asignar el usuario a req.user
    req.user = { id: decoded.userId, role: decoded.role }; // Cambiado a userId
    next();
  } catch (error) {
    console.error('Error en authMiddleware:', error); // Log para depuración
    return res.status(401).json({ message: 'Token inválido' });
  }
};