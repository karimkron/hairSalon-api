// controllers/service.controller.ts
import { Request, Response } from 'express';
import { Service } from '../models/Service';
import path from 'path';

export const createService = async (req: Request, res: Response) => {
  try {
    const { name, description, price, points, duration, category, stock } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No se proporcionó una imagen' });
    }

    const imagePath = req.file.path; // Ruta de la imagen en el servidor

    const newService = new Service({
      name,
      description,
      price,
      points,
      duration,
      category,
      image: imagePath, // Guardar la ruta de la imagen en la base de datos
      stock,
    });

    await newService.save();
    res.status(201).json(newService);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el servicio', error });
  }
};

export const getServices = async (req: Request, res: Response) => {
  try {
    const services = await Service.find();
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los servicios', error });
  }
};

export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, points, duration, category, stock } = req.body;

    let imagePath = req.body.image; // Mantener la imagen existente si no se sube una nueva

    // Si se sube una nueva imagen, actualizar la ruta
    if (req.file) {
      imagePath = req.file.path;
    }

    const updatedService = await Service.findByIdAndUpdate(
      id,
      { name, description, price, points, duration, category, image: imagePath, stock },
      { new: true }
    );

    res.status(200).json(updatedService);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el servicio', error });
  }
};

export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Service.findByIdAndDelete(id);
    res.status(200).json({ message: 'Servicio eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el servicio', error });
  }
};