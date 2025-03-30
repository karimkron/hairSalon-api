import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/barbershop',
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key',
  emailUser: process.env.EMAIL_USER || '',
  emailPassword: process.env.EMAIL_PASSWORD || '',
  emailFrom: process.env.EMAIL_FROM || '',
  resetCodeExpiry: Number(process.env.RESET_CODE_EXPIRY) || 20,
};

