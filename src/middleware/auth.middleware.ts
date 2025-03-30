import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User, IUser } from '../models/User';
import { AuthRequest } from '../types/request';
import NodeCache from 'node-cache';
import { Appointment } from '../models/Appointment';

// Caché para usuarios autenticados
const userCache = new NodeCache({ 
  stdTTL: 300, // 5 minutos de caché
  checkperiod: 320 // Periodo de verificación de caché
});

// Rastreo de intentos de acceso por IP
const accessAttempts: { [key: string]: { count: number, lastAttempt: number } } = {};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const clientIp = req.ip || 'unknown';

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      console.warn(`Intento de acceso sin token desde IP: ${clientIp}`);
      return res.status(401).json({ message: 'No se proporcionó token de autenticación' });
    }

    // Rate limiting
    const currentTime = Date.now();
    if (!accessAttempts[clientIp]) {
      accessAttempts[clientIp] = { count: 0, lastAttempt: currentTime };
    }

    if (currentTime - accessAttempts[clientIp].lastAttempt > 60000) {
      accessAttempts[clientIp] = { count: 0, lastAttempt: currentTime };
    }

    if (accessAttempts[clientIp].count >= 5) {
      console.warn(`Demasiados intentos de acceso desde IP: ${clientIp}`);
      return res.status(429).json({ message: 'Demasiados intentos. Intente más tarde.' });
    }

    accessAttempts[clientIp].count++;
    accessAttempts[clientIp].lastAttempt = currentTime;

    // Verificación de token
    let decoded;
    try {
      // Verificamos el token, pero aceptamos diferentes estructuras
      decoded = jwt.verify(token, config.jwtSecret) as { 
        userId: string; 
        role?: string;
        email?: string;
      };
      
      // Aseguramos que al menos tengamos un userId
      if (!decoded.userId) {
        console.warn(`Token sin userId de IP: ${clientIp}`);
        return res.status(401).json({ message: 'Token inválido: falta información de usuario' });
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        console.warn(`Token expirado de IP: ${clientIp}`);
        return res.status(401).json({ message: 'Token expirado. Inicie sesión nuevamente.' });
      } else if (error instanceof jwt.JsonWebTokenError) {
        console.warn(`Token malformado de IP: ${clientIp}`);
        return res.status(401).json({ message: 'Token inválido o malformado' });
      }
      throw error;
    }

    // Verificar usuario en caché o base de datos
    const cachedUser = userCache.get<IUser>(decoded.userId);
    let user: IUser | null = cachedUser || await User.findById(decoded.userId);
    
    if (!user) {
      console.warn(`Usuario no encontrado. Token con ID: ${decoded.userId}`);
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (!cachedUser) {
      userCache.set(decoded.userId, user);
    }

    // Solo verificar email si el token incluye email y no es superadmin
    if (user.role !== 'superadmin' && decoded.email && user.email !== decoded.email) {
      console.warn(`Email no coincide para usuario no superadmin`);
      return res.status(403).json({ message: 'Credenciales inválidas' });
    }

    if (user.isBlocked) {
      console.warn(`Intento de acceso de usuario bloqueado. Email: ${user.email}`);
      const superAdmin = await User.findOne({ role: 'superadmin' });
      const superAdminEmail = superAdmin ? superAdmin.email : 'soporte@example.com';

      return res.status(403).json({
        message: `Tu cuenta ha sido bloqueada. Contacta con el soporte: ${superAdminEmail}`,
      });
    }

    // Asignar información de usuario
    req.user = { 
      id: decoded.userId, 
      role: decoded.role || user.role, // Usar el role del token o el de la base de datos
      email: user.email
    };

    // Resetear intentos de acceso
    accessAttempts[clientIp] = { count: 0, lastAttempt: currentTime };

    next();
  } catch (error) {
    console.error('Error en authMiddleware:', error);
    return res.status(500).json({ message: 'Error interno de autenticación' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!['admin', 'superadmin'].includes(req.user?.role || '')) {
    return res.status(403).json({ message: 'Acceso restringido a administradores' });
  }
  next();
};

export const superAdminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ message: 'Acceso restringido a superadministrador' });
  }
  next();
};

export const isAppointmentOwner = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const appointmentId = req.params.id;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    const isOwner = appointment.user.toString() === userId;
    const isAdminOrSuperAdmin = ['admin', 'superadmin'].includes(userRole || '');

    if (!isOwner && !isAdminOrSuperAdmin) {
      return res.status(403).json({ 
        message: 'No tienes permiso para realizar esta acción sobre esta cita' 
      });
    }

    next();
  } catch (error: any) {
    console.error('Error in isAppointmentOwner middleware:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};