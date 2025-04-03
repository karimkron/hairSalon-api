import { Request, Response } from 'express';
import { Service } from '../models/Service';
import cloudinary from '../config/cloudinary';

const uploadToCloudinary = async (file: Express.Multer.File) => {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'services' },
      (error, result) => {
        if (error) reject(error);
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
};

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const createService = async (req: Request, res: Response) => {
  try {
    const { name, description, price, points, duration, categories, imageUrl } = req.body;
    let finalImageUrl = '';

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file);
        finalImageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Error al subir imagen:", uploadError);
        return res.status(500).json({ error: "Error al subir imagen" });
      }
    } else if (imageUrl) {
      if (imageUrl === 'none') {
        finalImageUrl = '';
      } else if (isValidUrl(imageUrl)) {
        finalImageUrl = imageUrl;
      } else {
        return res.status(400).json({ error: "URL de imagen inválida" });
      }
    }

    // Convertir categories a array si viene como string
    const serviceCategories = Array.isArray(categories) 
      ? categories 
      : categories ? [categories] : [];

    const newService = new Service({
      name,
      description,
      price: Number(price),
      points: Number(points),
      duration: Number(duration),
      categories: serviceCategories,
      image: finalImageUrl,
    });

    await newService.save();
    res.status(201).json(newService);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear servicio"
    });
  }
};

export const getServices = async (req: Request, res: Response) => {
  try {
    const services = await Service.find();
    res.status(200).json(services);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener servicios'
    });
  }
};

// Nueva función para obtener todas las categorías de servicios
export const getServiceCategories = async (req: Request, res: Response) => {
  try {
    const categories = await Service.distinct("categories");
    res.status(200).json(categories);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener categorías'
    });
  }
};

// Nueva función para agregar una categoría
export const addServiceCategory = async (req: Request, res: Response) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ message: "Categoría requerida" });
    }

    // Verificar si la categoría ya existe
    const existingCategory = await Service.findOne({ categories: category });
    if (existingCategory) {
      return res.status(400).json({ message: "La categoría ya existe" });
    }

    // No actualizar ningún servicio, simplemente retornar la nueva categoría
    res.status(201).json({ category });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al agregar categoría",
    });
  }
};

export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, points, duration, categories, imageUrl } = req.body;
    let finalImageUrl = '';

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file);
      finalImageUrl = uploadResult.secure_url;
    } else if (imageUrl) {
      if (imageUrl === 'none') {
        finalImageUrl = '';
      } else if (isValidUrl(imageUrl)) {
        finalImageUrl = imageUrl;
      } else {
        throw new Error('URL de imagen inválida');
      }
    }

    // Convertir categories a array si viene como string
    const serviceCategories = Array.isArray(categories) 
      ? categories 
      : categories ? [categories] : [];

    const updatedService = await Service.findByIdAndUpdate(
      id,
      {
        name,
        description,
        price: Number(price),
        points: Number(points),
        duration: Number(duration),
        categories: serviceCategories,
        image: finalImageUrl,
      },
      { new: true }
    );
    
    res.status(200).json(updatedService);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar servicio'
    });
  }
};

export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Service.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Servicio eliminado' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al eliminar servicio'
    });
  }
};