import { Request, Response } from 'express';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../types/request';

// Obtener todos los usuarios (solo para superadmin)
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar si el usuario es superadmin
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }

    // Obtener todos los usuarios
    const users = await User.find().select('-password'); // Excluir la contraseña
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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