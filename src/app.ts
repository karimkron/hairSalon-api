import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import serviceRoutes from './routes/service.routes';
import adminRoutes from './routes/admin.routes'; // Importamos las nuevas rutas de administradores
import productRoutes from './routes/product.routes'; // Importamos las rutas de productos
import userRoutes from './routes/user.routes';

const app = express();

// Configuración de CORS
const corsOptions = {
  origin: '*', //https://hairsalon-web.onrender.com URL de tu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Permitir subir imágenes más grandes
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rutas
app.use('/api', authRoutes);       // Rutas de autenticación
app.use('/api', serviceRoutes);    // Rutas de servicios
app.use('/api', adminRoutes);      // Nuevas rutas de administradores
app.use('/api', productRoutes);  // Rutas de productos
app.use('/api', userRoutes);       // Rutas de usuarios

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Función para iniciar el servidor
const startServer = async () => {
  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log('Conectado a MongoDB con éxito!');

    // Middleware para loggear las solicitudes
    app.use((req, _, next) => {
      console.log(`Solicitud recibida: ${req.method} ${req.url}`);
      next();
    });

    // Iniciar el servidor
    app.listen(config.port, () => {
      console.log(`Servidor corriendo en el puerto ${config.port}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();

export default app;