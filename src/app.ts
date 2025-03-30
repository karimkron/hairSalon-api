import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import expressWinston from 'express-winston';
import cluster from 'cluster';
import os from 'os';

import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import serviceRoutes from './routes/service.routes';
import adminRoutes from './routes/admin.routes';
import productRoutes from './routes/product.routes';
import userRoutes from './routes/user.routes';
import userAuthRoutes from './routes/userAuth.routes';
import adminAuthRoutes from './routes/adminAuth.routes';
import verificationRoutes from './routes/verification.routes';
import cartRoutes from './routes/cart.routes';
import appointmentRoutes from './routes/appointment.routes';
import scheduleRoutes from './routes/schedule.routes';
import availabilityRoutes from './routes/availability.routes';
import adminAppointmentRoutes from './routes/adminAppointment.routes';

// Configuración de Redis


if (cluster.isPrimary && process.env.NODE_ENV !== 'development') {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) cluster.fork();
  cluster.on('exit', (worker) => cluster.fork());
} else {
  const app = express();

  // Aumentar límites del sistema
  require('http').globalAgent.maxSockets = Infinity;
  require('https').globalAgent.maxSockets = Infinity;

  // Configuración de logs
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.simple()
      }),
      new winston.transports.File({ 
        filename: 'error.log', 
        level: 'error' 
      }),
      new winston.transports.File({ 
        filename: 'combined.log' 
      })
    ]
  });

  // Configurar CORS
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));

  // Configurar rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Demasiadas solicitudes desde esta IP'
  }));

  // Middleware esencial
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging de solicitudes
  app.use(expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    colorize: false
  }));

  // Registrar rutas
  app.use('/api/cart', cartRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api', [
    authRoutes,
    userAuthRoutes,
    adminAuthRoutes,
    serviceRoutes,
    adminRoutes,
    productRoutes,
    userRoutes,
    adminAppointmentRoutes,
    verificationRoutes,
    appointmentRoutes,
    availabilityRoutes
  ]);

  // Ruta de estado
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      connections: mongoose.connections.length,
    });
  });

  // Manejo de errores
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(err.stack);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' 
        ? 'Error interno del servidor' 
        : err.message
    });
  });

  // Conexión a MongoDB
  const connectDB = async () => {
    try {
      await mongoose.connect(config.mongoUri, {
        retryWrites: true,
        w: 'majority',
        maxPoolSize: 100,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });
      logger.info('Conexión exitosa a MongoDB');
    } catch (error) {
      logger.error('Error de conexión a MongoDB:', error);
      process.exit(1);
    }
  };

  // Iniciar servidor
  const startServer = async () => {
    await connectDB();
    const server = app.listen(config.port, () => {
      logger.info(`Servidor ejecutándose en puerto ${config.port}`);
      server.maxConnections = Infinity;
    });

    process.on('SIGTERM', () => {
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    });
  };

  startServer();
}