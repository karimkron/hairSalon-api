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
import chalk from 'chalk';
import { format } from 'winston';

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

// Para entornos de desarrollo, desactivamos el clustering completamente
const shouldUseCluster = process.env.NODE_ENV !== 'development' && process.env.DISABLE_CLUSTER !== 'true';

if (cluster.isPrimary && shouldUseCluster) {
  const numCPUs = os.cpus().length;
  // Solo el proceso principal muestra este mensaje
  console.log(chalk.blue.bold(`📊 Iniciando cluster con ${numCPUs} workers...`));
  
  // Crear workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker) => {
    console.log(chalk.red.bold(`⚠️ Worker ${worker.id} ha muerto, creando uno nuevo...`));
    cluster.fork();
  });
  
  // El proceso principal no ejecuta el código del servidor
} else {
  // Configuración de la aplicación - Solo para workers o cuando no usamos clustering
  const app = express();
  
  // Para entornos de desarrollo o cuando queremos depurar sin clústering
  if (!shouldUseCluster || (cluster.isPrimary && process.env.NODE_ENV === 'development')) {
    console.log(chalk.yellow.bold('🔍 Ejecutando en modo único (sin clustering)'));
  }
  
  // Configuración básica
  app.set('trust proxy', 1);
  
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "trusted-site.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "res.cloudinary.com"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        connectSrc: ["'self'", "https://hairsalon-app.onrender.com"]
      }
    },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true }
  }));

  // Límites del sistema
  require('http').globalAgent.maxSockets = Infinity;
  require('https').globalAgent.maxSockets = Infinity;

  // Funciones auxiliares para formateo de logs
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'info': return { color: chalk.green.bold, emoji: '📝 ' };
      case 'warn': return { color: chalk.yellow.bold, emoji: '⚠️ ' };
      case 'error': return { color: chalk.red.bold, emoji: '❌ ' };
      default: return { color: chalk.white, emoji: '' };
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return chalk.green.bold;
      case 'POST': return chalk.blue.bold;
      case 'PUT': return chalk.yellow.bold;
      case 'DELETE': return chalk.red.bold;
      default: return chalk.white.bold;
    }
  };

  const getStatusColor = (statusCode: number) => {
    let color;
    let emoji = '';
    
    if (statusCode < 300) {
      color = chalk.green.bold;
      emoji = '✅ ';
    } else if (statusCode < 400) {
      color = chalk.cyan.bold;
      emoji = '↪️ ';
    } else if (statusCode < 500) {
      color = chalk.yellow.bold;
      emoji = '⚠️ ';
    } else {
      color = chalk.red.bold;
      emoji = '❌ ';
    }
    
    return { color, emoji };
  };

  // Formato personalizado para los logs
  const customLogFormat = format.printf((info) => {
    const { level = '', message = '', timestamp = '' } = info;
    const metadata = (info.meta || {}) as any;
    
    // Obtener color y emoji para el nivel de log
    const { color: levelColor, emoji } = getLogLevelColor(level);
    
    // Si es una solicitud HTTP
    if (metadata && metadata.req) {
      const req = metadata.req;
      const res = metadata.res || {};
      const responseTime = metadata.responseTime || 0;
      
      // Método HTTP (GET, POST, etc.)
      const methodColor = getMethodColor(req.method);
      
      // Código de estado HTTP
      const statusCode = res && typeof res === 'object' ? (res.statusCode || 0) : 0;
      const { color: statusColor, emoji: statusEmoji } = getStatusColor(statusCode);
      
      // Formato para solicitudes HTTP
      return `${statusEmoji}${chalk.gray(`[${timestamp}]`)} ${methodColor(req.method)} ${chalk.cyan(req.originalUrl)} ${statusColor(statusCode)} ${chalk.gray(`${responseTime}ms`)} ${chalk.gray(`IP: ${req.headers['x-forwarded-for'] || req.ip || 'unknown'}`)}`;
    }
    
    // Formato para mensajes regulares
    return `${emoji}${chalk.gray(`[${timestamp}]`)} ${levelColor(level.toUpperCase())} ${message}`;
  });

  // Configuración de logs
  const logger = winston.createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.metadata(),
      customLogFormat
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ 
        filename: 'error.log', 
        level: 'error',
        format: format.combine(
          format.timestamp(),
          format.json()
        )
      }),
      new winston.transports.File({ 
        filename: 'combined.log',
        format: format.combine(
          format.timestamp(),
          format.json()
        )
      })
    ]
  });

  // Middleware
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Demasiadas solicitudes desde esta IP'
  }));

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Configurar el logging de solicitudes
  app.use(expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}}',
    expressFormat: false,
    colorize: true
  }));

  // Rutas
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

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      connections: mongoose.connections.length,
      worker: cluster.isWorker ? cluster.worker?.id : 'primary'
    });
  });

  // Manejo de errores
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`Error: ${err.message}\n${err.stack}`);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : err.message
    });
  });

  // SOLUCIÓN PARA EVITAR CONEXIONES Y LOGS DUPLICADOS:
  // Solo el primer worker o el proceso principal en modo sin cluster muestra logs de conexión
  const isFirstWorker = !cluster.isWorker || (cluster.worker?.id === 1);
  
  // Conexión a MongoDB
  const connectDB = async () => {
    try {
      // Solo mostrar logs de conexión en el worker 1 o en modo sin cluster
      if (isFirstWorker) {
        console.log(chalk.blue.bold('🔌 Conectando a MongoDB...'));
      }
      
      await mongoose.connect(config.mongoUri, {
        retryWrites: true,
        w: 'majority',
        maxPoolSize: 100,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      // Solo mostrar logs de éxito en el worker 1 o en modo sin cluster
      if (isFirstWorker) {
        console.log(chalk.green.bold('✅ Conectado con éxito a MongoDB'));
      }
    } catch (error) {
      // Los errores siempre se muestran independientemente del worker
      console.error(chalk.red.bold('❌ Error de conexión a MongoDB:'), error);
      process.exit(1);
    }
  };

  // Iniciar servidor
  const startServer = async () => {
    await connectDB();
    
    // Solo mostrar logs de inicio en el worker 1 o en modo sin cluster
    if (isFirstWorker) {
      console.log(chalk.blue.bold('🚀 Iniciando servidor...'));
    }
    
    const server = app.listen(config.port, () => {
      // Solo mostrar logs de servidor iniciado en el worker 1 o en modo sin cluster
      if (isFirstWorker) {
        console.log(chalk.green.bold(`🎯 Servidor ejecutándose en puerto ${config.port}`));
      }
      server.maxConnections = Infinity;
    });

    process.on('SIGTERM', async () => {
      if (isFirstWorker) {
        console.log(chalk.yellow.bold('🛑 Apagando servidor...'));
      }
      await mongoose.disconnect();
      server.close(() => process.exit(0));
    });
  };

  startServer();
}