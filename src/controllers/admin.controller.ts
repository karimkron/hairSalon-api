import { Request, Response } from 'express';
import { generateAdminCode, verifyAdminCode } from '../services/admin.service';

// Función para solicitar un código de administrador
export const requestAdminCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validar que el email esté presente
    if (!email) {
      return res.status(400).json({ success: false, message: 'El email es requerido' });
    }

    // Generar el código y enviarlo al superadmin
    const result = await generateAdminCode(email);

    // Enviar respuesta al cliente
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Función para verificar un código de administrador
export const verifyAdminCodeController = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    // Validar que el email y el código estén presentes
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'El email y el código son requeridos' });
    }

    // Verificar el código
    const result = await verifyAdminCode(email, code);

    // Enviar respuesta al cliente
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};