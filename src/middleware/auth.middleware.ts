import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User } from '../models/User';
import { AuthRequest } from '../types/request';

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No se proporcionó token de autenticación' });
    }

    // Verificar el token y decodificarlo
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string };  
    console.log('Decoded token:', decoded);

    // Buscar al usuario en la base de datos
    const user = await User.findById(decoded.userId);
    console.log('User found:', user);

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
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch (error) {
    console.error('Error en authMiddleware:', error);
    return res.status(401).json({ message: 'Token inválido' });
  }
};