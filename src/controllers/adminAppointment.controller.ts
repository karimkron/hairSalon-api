import { Response } from 'express';
import { AuthRequest } from "../types/request";
import mongoose from 'mongoose';
import { Appointment } from '../models/Appointment';
import { startOfDay, endOfDay } from 'date-fns';

// Definir interfaces para tipar correctamente
interface CartProduct {
  _id: mongoose.Types.ObjectId;
  name: string;
  price: number;
  description?: string;
  mainImage?: string;
}

interface CartItem {
  product: CartProduct;
  quantity: number;
  status: 'pending' | 'confirmed';
  _id?: mongoose.Types.ObjectId;
}

interface CartDocument {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  items: CartItem[];
}

/**
 * @description Obtiene todas las citas para el calendario de administración
 * @param req Solicitud HTTP con parámetros opcionales de filtrado (from, to, status)
 * @param res Respuesta HTTP con las citas encontradas
 */
export const getAllAppointments = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el usuario sea administrador
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de administrador.' 
      });
    }
    
    // Obtener parámetros de filtrado
    const { from, to, status } = req.query;
    
    // Construir filtro base
    const filter: any = {};
    
    // Agregar filtro por estado si se proporciona
    if (status) {
      if (typeof status === 'string' && status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }
    
    // Agregar filtro por rango de fechas
    if (from || to) {
      filter.date = {};
      
      if (from) {
        const fromDate = new Date(from as string);
        filter.date.$gte = startOfDay(fromDate);
      }
      
      if (to) {
        const toDate = new Date(to as string);
        filter.date.$lte = endOfDay(toDate);
      }
    }
    
    // Obtener citas con filtros aplicados y buscar productos en el carrito
    const appointments = await Appointment.find(filter)
      .populate('user', 'name email phone')
      .populate('services', 'name duration price description category')
      .sort({ date: 1, time: 1 });
    
    // Buscar los productos del carrito para cada usuario
    const userIds = appointments.map(appointment => {
      const userId = appointment.user;
      return typeof userId === 'object' && userId !== null ? userId._id : userId;
    });
    
    // Búsqueda de carritos
    let cartData: any[] = [];
    try {
      const Cart = mongoose.model('Cart');
      const carts = await Cart.find({ user: { $in: userIds } })
        .populate({
          path: 'items.product',
          select: 'name price description mainImage'
        }).lean();
      cartData = carts || [];
    } catch (error) {
      console.log('Nota: Modelo Cart no disponible o error al buscar carritos', error);
    }
    
    // Transformar datos con opciones seguras para manejo de tipos
    const formattedAppointments = appointments.map(appointment => {
      // Convertir a objeto plano con transformación segura
      const appointmentObj: any = appointment.toObject({
        transform: (doc, ret) => {
          // Asegurar que los servicios siempre sean un array de objetos con propiedades consistentes
          if (Array.isArray(ret.services)) {
            ret.services = ret.services.map((service: any) => {
              if (typeof service === 'string' || !service) {
                try {
                  // Intentar convertir a ObjectId si es un ID válido
                  const serviceId = typeof service === 'string' && mongoose.isValidObjectId(service) ? 
                    new mongoose.Types.ObjectId(service) : 
                    new mongoose.Types.ObjectId();
                  
                  return {
                    _id: serviceId,
                    name: 'Servicio no disponible',
                    duration: 0,
                    price: 0,
                    category: 'N/A',
                    description: ''
                  };
                } catch (err) {
                  // En caso de error, usar un ObjectId nuevo
                  return {
                    _id: new mongoose.Types.ObjectId(),
                    name: 'Servicio no disponible',
                    duration: 0,
                    price: 0,
                    category: 'N/A',
                    description: ''
                  };
                }
              }
              return service;
            });
          } else {
            ret.services = [];
          }
          
          // Asegurar que la información del usuario esté disponible
          if (typeof ret.user === 'string' || !ret.user) {
            try {
              // Intentar convertir a ObjectId si es un ID válido
              const userId = typeof ret.user === 'string' && mongoose.isValidObjectId(ret.user) ?
                new mongoose.Types.ObjectId(ret.user) :
                new mongoose.Types.ObjectId();
                
              ret.user = {
                _id: userId,
                name: 'Cliente',
                email: '',
                phone: ''
              };
            } catch (err) {
              // En caso de error, usar un ObjectId nuevo
              ret.user = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Cliente',
                email: '',
                phone: ''
              };
            }
          }
          
          return ret;
        }
      });
      
      // Agregar productos del carrito a la cita
      if (cartData.length > 0) {
        const userId = typeof appointmentObj.user === 'object' && appointmentObj.user !== null 
          ? appointmentObj.user._id 
          : appointmentObj.user;
          
        const userCart = cartData.find((cart: any) => {
          const cartUserId = cart.user;
          return cartUserId && cartUserId.toString() === userId.toString();
        });
        
        if (userCart && Array.isArray(userCart.items) && userCart.items.length > 0) {
          appointmentObj.cartItems = userCart.items.map((item: any) => ({
            product: item.product,
            quantity: item.quantity,
            status: item.status || 'pending'
          }));
        } else {
          appointmentObj.cartItems = [];
        }
      } else {
        appointmentObj.cartItems = [];
      }
      
      return appointmentObj;
    });
    
    res.status(200).json(formattedAppointments);
  } catch (error) {
    console.error('Error al obtener citas para calendario:', error);
    res.status(500).json({ 
      error: 'Error al obtener las citas',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Obtiene estadísticas de citas para el dashboard de administración
 * @param req Solicitud HTTP
 * @param res Respuesta HTTP con estadísticas
 */
export const getAppointmentsStats = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el usuario sea administrador
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de administrador.' 
      });
    }
    
    // Obtener fecha actual
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);
    
    // Estadísticas para hoy
    const todaysAppointments = await Appointment.countDocuments({ 
      date: { $gte: startOfToday, $lte: endOfToday },
      status: { $ne: 'cancelled' }
    });
    
    // Estadísticas por estado
    const statusStats = await Appointment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Estadísticas por mes (últimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyStats = await Appointment.aggregate([
      { 
        $match: { 
          date: { $gte: sixMonthsAgo },
          status: { $ne: 'cancelled' }
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: '$date' }, 
            month: { $month: '$date' } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    // Formatear estadísticas para respuesta
    const stats = {
      today: todaysAppointments,
      byStatus: Object.fromEntries(
        statusStats.map(stat => [stat._id, stat.count])
      ),
      monthly: monthlyStats.map(stat => ({
        month: `${stat._id.year}-${stat._id.month}`,
        count: stat.count
      }))
    };
    
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas de citas:', error);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

/**
 * @description Marca una cita como completada
 * @param req Solicitud HTTP con el ID de la cita
 * @param res Respuesta HTTP con el resultado
 */
export const completeAppointment = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el usuario sea administrador
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de administrador.' 
      });
    }
    
    const { id } = req.params;
    
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'ID de cita inválido' });
    }
    
    // Buscar la cita
    const appointment = await Appointment.findById(id);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    // Actualizar el estado de la cita a 'completed'
    appointment.status = 'completed';
    
    // Guardar la cita actualizada
    await appointment.save();
    
    // Buscar el carrito del usuario
    let userCartData: any = null;
    try {
      const Cart = mongoose.model('Cart');
      const cart = await Cart.findOne({ user: appointment.user })
        .populate({
          path: 'items.product',
          select: 'name price description mainImage'
        }).lean();
      userCartData = cart;
    } catch (error) {
      console.log('Nota: No se pudo encontrar el carrito del usuario', error);
    }
    
    // Información para devolver
    const appointmentDetails = await Appointment.findById(id)
      .populate('user', 'name email phone')
      .populate('services', 'name duration price description category');
      
    // Agregar información del carrito si existe
    const responseData: any = appointmentDetails?.toObject() || {};
    
    if (userCartData && Array.isArray(userCartData.items) && userCartData.items.length > 0) {
      responseData.cartItems = userCartData.items.map((item: any) => ({
        product: item.product,
        quantity: item.quantity,
        status: item.status || 'pending'
      }));
    } else {
      responseData.cartItems = [];
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Cita marcada como completada exitosamente',
      appointment: responseData
    });
  } catch (error) {
    console.error('Error al marcar cita como completada:', error);
    res.status(500).json({ 
      error: 'Error al marcar la cita como completada',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};