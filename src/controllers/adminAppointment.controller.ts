import { Response } from 'express';
import { AuthRequest } from "../types/request";
import mongoose from 'mongoose';
import { Appointment } from '../models/Appointment';
import { startOfDay, endOfDay, format, parse, addDays, subDays, getDay, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import Pickup from '../models/Pickup';
import Product from '../models/Product';

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
    const { from, to, status, limit } = req.query;
    
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
    let query = Appointment.find(filter)
      .populate('user', 'name email phone')
      .populate('services', 'name duration price description category')
      .sort({ date: 1, time: 1 });
    
    // Aplicar límite si se proporciona
    if (limit) {
      query = query.limit(parseInt(limit as string, 10));
    }
    
    const appointments = await query;
    
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
 * @param req Solicitud HTTP con parámetros para rangos de fechas
 * @param res Respuesta HTTP con estadísticas detalladas
 */
export const getAppointmentsStats = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el usuario sea administrador
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de administrador.' 
      });
    }
    
    // Obtener parámetros de filtrado
    const { from, to } = req.query;
    
    // Calcular fechas de inicio y fin
    let startDate, endDate;
    
    if (from) {
      startDate = startOfDay(new Date(from as string));
    } else {
      // Por defecto, 30 días atrás
      startDate = startOfDay(subDays(new Date(), 30));
    }
    
    if (to) {
      endDate = endOfDay(new Date(to as string));
    } else {
      endDate = endOfDay(new Date());
    }
    
    // Periodo anterior para comparación
    const periodLength = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const previousStartDate = subDays(startDate, periodLength);
    const previousEndDate = subDays(endDate, periodLength);

    // --- Estadísticas por estado ---
    const statusStats = await Appointment.aggregate([
      { 
        $match: { 
          date: { $gte: startDate, $lte: endDate }
        } 
      },
      { 
        $group: { 
          _id: "$status", 
          count: { $sum: 1 } 
        } 
      }
    ]);

    // Total de citas en periodo actual
    const totalAppointments = statusStats.reduce((sum, stat) => sum + stat.count, 0);
    
    // Total de citas en periodo anterior para calcular cambio porcentual
    const previousPeriodStats = await Appointment.countDocuments({
      date: { $gte: previousStartDate, $lte: previousEndDate }
    });
    
    // Calcular cambio porcentual
    const percentChange = previousPeriodStats > 0 
      ? ((totalAppointments - previousPeriodStats) / previousPeriodStats) * 100 
      : 0;

    // --- Estadísticas por día/hora (para encontrar los más populares) ---
    const appointmentsByDayHour = await Appointment.aggregate([
      { 
        $match: { 
          date: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        } 
      },
      {
        $project: {
          dayOfWeek: { $dayOfWeek: "$date" }, // 1 (Sunday) to 7 (Saturday)
          time: 1
        }
      },
      {
        $group: {
          _id: { 
            dayOfWeek: "$dayOfWeek",
            time: "$time"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Encontrar día más popular
    const dayMapping = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const dayCountMap = new Map();
    
    appointmentsByDayHour.forEach(item => {
      const day = item._id.dayOfWeek;
      dayCountMap.set(day, (dayCountMap.get(day) || 0) + item.count);
    });
    
    let mostPopularDay = "No disponible";
    let maxDayCount = 0;
    
    dayCountMap.forEach((count, day) => {
      if (count > maxDayCount) {
        maxDayCount = count;
        mostPopularDay = dayMapping[day - 1]; // Ajustar índice
      }
    });
    
    // Encontrar hora más popular
    let mostPopularTime = "No disponible";
    let maxTimeCount = 0;
    
    const timeCountMap = new Map();
    appointmentsByDayHour.forEach(item => {
      const time = item._id.time;
      const count = item.count;
      
      timeCountMap.set(time, (timeCountMap.get(time) || 0) + count);
      
      if (timeCountMap.get(time) > maxTimeCount) {
        maxTimeCount = timeCountMap.get(time);
        mostPopularTime = time;
      }
    });
    
    // --- Estadísticas por fecha (para gráficos de tendencia) ---
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    const dateStats = await Promise.all(
      dateRange.map(async (date) => {
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        
        const count = await Appointment.countDocuments({
          date: { $gte: dayStart, $lte: dayEnd },
          status: { $ne: 'cancelled' }
        });
        
        return {
          date: format(date, 'yyyy-MM-dd'),
          count
        };
      })
    );
    
    // --- Estadísticas por servicio ---
    const serviceStats = await Appointment.aggregate([
      { 
        $match: { 
          date: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        } 
      },
      { $unwind: "$services" },
      { 
        $group: { 
          _id: "$services", 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Obtener detalles de los servicios
    const serviceIds = serviceStats.map(stat => stat._id);
    const Service = mongoose.model('Service');
    const services = await Service.find({ _id: { $in: serviceIds } });
    
    const serviceDetails = serviceStats.map(stat => {
      const service = services.find(s => s._id.toString() === stat._id.toString());
      return {
        serviceId: stat._id,
        serviceName: service ? service.name : 'Servicio desconocido',
        count: stat.count
      };
    });
    
    // --- Estadísticas por hora (para gráfico de distribución) ---
    const hourCounts = await Appointment.aggregate([
      { 
        $match: { 
          date: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        } 
      },
      {
        $group: {
          _id: "$time",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const byHour = hourCounts.map(item => ({
      hour: item._id,
      count: item.count
    }));
    
    // --- Calcular tasa de cancelación ---
    const cancelledCount = statusStats.find(stat => stat._id === 'cancelled')?.count || 0;
    const cancellationRate = totalAppointments > 0 
      ? (cancelledCount / totalAppointments) * 100 
      : 0;
    
    // Formato final de respuesta con todas las estadísticas
    const stats = {
      total: totalAppointments,
      today: await Appointment.countDocuments({ 
        date: { 
          $gte: startOfDay(new Date()),
          $lte: endOfDay(new Date())
        },
        status: { $ne: 'cancelled' }
      }),
      percentChange,
      byStatus: Object.fromEntries(
        statusStats.map(stat => [stat._id || 'unknown', stat.count])
      ),
      byDate: dateStats,
      byService: serviceDetails,
      byHour,
      mostPopularDay,
      mostPopularTime,
      cancellationRate
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
 * @description Obtiene estadísticas de productos para el dashboard
 * @param req Solicitud HTTP con parámetros para rangos de fechas
 * @param res Respuesta HTTP con estadísticas de productos
 */
export const getProductsStats = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar que el usuario sea administrador
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de administrador.' 
      });
    }
    
    // Obtener parámetros de filtrado
    const { from, to } = req.query;
    
    // Calcular fechas de inicio y fin
    let startDate, endDate;
    
    if (from) {
      startDate = startOfDay(new Date(from as string));
    } else {
      // Por defecto, 30 días atrás
      startDate = startOfDay(subDays(new Date(), 30));
    }
    
    if (to) {
      endDate = endOfDay(new Date(to as string));
    } else {
      endDate = endOfDay(new Date());
    }
    
    // Estadísticas de productos recogidos y cancelados
    const pickupsStats = await Pickup.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      }
    ]);
    
    // Productos más populares
    const topProducts = await Pickup.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'pending' // Solo productos pendientes de recogida
        }
      },
      {
        $group: {
          _id: "$product",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);
    
    // Obtener detalles de los productos
    const productIds = topProducts.map(item => item._id);
    const products = await Product.find({ _id: { $in: productIds } });
    
    const topProductsDetails = topProducts.map(item => {
      const product = products.find(p => p._id.toString() === item._id.toString());
      return {
        productId: item._id,
        name: product ? product.name : 'Producto desconocido',
        count: item.count,
        quantity: item.totalQuantity,
        image: product?.mainImage || null
      };
    });
    
    // Calcular total de productos confirmados y cancelados
    const confirmedProducts = pickupsStats.find(stat => stat._id === 'pending')?.totalQuantity || 0;
    const completedProducts = pickupsStats.find(stat => stat._id === 'completed')?.totalQuantity || 0;
    const cancelledProducts = pickupsStats.find(stat => stat._id === 'deleted')?.totalQuantity || 0;
    
    // Formato final de respuesta
    const stats = {
      confirmed: confirmedProducts,
      completed: completedProducts,
      cancelled: cancelledProducts,
      total: confirmedProducts + completedProducts + cancelledProducts,
      topProducts: topProductsDetails
    };
    
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas de productos:', error);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas de productos',
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
    await appointment.updateOne({ status: 'completed' }, { runValidators: false });

    
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