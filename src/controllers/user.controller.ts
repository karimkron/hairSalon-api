import { Request, Response } from 'express';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../types/request';

/**
 * Obtiene todos los usuarios con búsqueda y paginación
 * @param req Solicitud con parámetros de búsqueda y paginación
 * @param res Respuesta con usuarios filtrados y metadatos de paginación
 */
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    // Obtener parámetros de paginación y búsqueda
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';
    const skip = (page - 1) * limit;

    // Construir la consulta de búsqueda
    let query: any = {};
    
    if (search) {
      // Búsqueda en múltiples campos con expresiones regulares insensibles a mayúsculas/minúsculas
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Ejecutar la consulta con paginación
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password') // Excluir la contraseña
        .sort({ createdAt: -1 }) // Ordenar por fecha de creación descendente
        .skip(skip)
        .limit(limit),
      User.countDocuments(query) // Contar el total de resultados para la paginación
    ]);

    // Calcular el número total de páginas
    const totalPages = Math.ceil(total / limit);

    // Enviar respuesta con usuarios y metadatos de paginación
    res.status(200).json({
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error: any) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ 
      message: error.message || 'Error al obtener usuarios',
      success: false
    });
  }
};

// Obtener un usuario por ID (solo para superadmin y admin)
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin o admin
    if (req.user?.role !== 'superadmin' && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    const user = await User.findById(req.params.id).select('-password'); // Excluir la contraseña
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Nuevo endpoint: Obtener información del usuario actual
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que existe un usuario autenticado
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    // Obtener información completa del usuario desde la base de datos
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Enviar los datos del usuario actual
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar un usuario (solo para superadmin y admin)
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin o admin
    if (req.user?.role !== 'superadmin' && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    const { id } = req.params;
    const { name, email, phone, role, rank } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { name, email, phone, role, rank },
      { new: true }
    ).select('-password'); // Excluir la contraseña

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Modificar la contraseña de un usuario (solo para superadmin y admin)
export const updatePassword = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin o admin
    if (req.user?.role !== 'superadmin' && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    // Encriptar la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { password: hashedPassword },
      { new: true }
    ).select('-password'); // Excluir la contraseña

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Bloquear/desbloquear un usuario (solo para superadmin)
export const toggleBlockUser = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Cambiar el estado de bloqueo
    user.isBlocked = !user.isBlocked;
    await user.save();

    res.status(200).json({
      message: user.isBlocked ? 'Usuario bloqueado' : 'Usuario desbloqueado',
      isBlocked: user.isBlocked,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Eliminar un usuario (solo para superadmin)
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json({ message: 'Usuario eliminado' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar información del usuario actual
export const updateCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    const { name, email, phone } = req.body;
    
    // Actualiza solo ciertos campos permitidos para el usuario
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, phone },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Actualizar contraseña del usuario actual
export const updateCurrentUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    const { currentPassword, newPassword } = req.body;
    
    // Verificar la contraseña actual
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    }
    
    // Encriptar y guardar la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};