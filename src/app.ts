import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import expressWinston from 'express-winston';

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

const app = express();

// Logging configuration
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

// CORS configuration with strict origin
const corsOptions = {
  origin: '*', // Explicitly defined allowed origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Middleware stack
app.use(helmet()); // Security headers
app.use(cors(corsOptions)); // CORS protection
app.use(compression()); // Response compression
app.use(limiter); // Rate limiting
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  colorize: false
}));

// Routes
app.use('/api', authRoutes);
app.use('/api', userAuthRoutes);
app.use('/api', adminAuthRoutes);
app.use('/api', serviceRoutes);
app.use('/api', adminRoutes);
app.use('/api', productRoutes);
app.use('/api', userRoutes);
app.use('/api', verificationRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api', appointmentRoutes);
app.use('/api/schedule', scheduleRoutes);

// Health check route
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log the error
  logger.error(err.message, { 
    stack: err.stack,
    method: req.method,
    path: req.path
  });

  // Determine error type and appropriate status code
  const statusCode = 
    err.name === 'ValidationError' ? 400 :
    err.name === 'UnauthorizedError' ? 401 :
    err.name === 'ForbiddenError' ? 403 :
    500;

  res.status(statusCode).json({ 
    success: false,
    message: statusCode === 500 ? 'Internal Server Error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { 
      error: err.message,
      stack: err.stack 
    })
  });
});

// Server startup function
const startServer = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri, {
      retryWrites: true,
      w: 'majority'
    });
    logger.info('Successfully connected to MongoDB');

    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Initialize server
startServer();

export default app;