import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import serviceRoutes from './routes/service.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', authRoutes);
app.use('/api', serviceRoutes); 

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const startServer = async () => {
  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log('Conectado a MongoDB con éxito!');

    app.listen(config.port, () => {
      console.log(`Servidor corriendo en el puerto ${config.port}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();

export default app;