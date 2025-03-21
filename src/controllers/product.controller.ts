import { Request, Response } from 'express';
import Product from '../models/Product';
import cloudinary from '../config/cloudinary';

const uploadToCloudinary = async (file: Express.Multer.File) => {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'products' },
      (error, result) => {
        if (error) reject(error);
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      message: error.message || 'Error al obtener productos'
    });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, brand, description, price, stock, available, mainImageIndex, categories } = req.body;
    const images = req.files as Express.Multer.File[];

    // Subir imágenes a Cloudinary
    const imageUrls = await Promise.all(
      images.map(async (file) => {
        try {
          const uploadResult = await uploadToCloudinary(file);
          return uploadResult.secure_url;
        } catch (error) {
          console.error('Error subiendo imagen a Cloudinary:', error);
          throw new Error('Error al subir imágenes');
        }
      })
    );

    // Determinar la imagen principal usando el índice enviado desde el frontend
    const mainImage = imageUrls[parseInt(mainImageIndex, 10)] || imageUrls[0];

    // Crear el nuevo producto
    const newProduct = new Product({
      name,
      brand,
      description,
      price: Number(price),
      stock: Number(stock),
      available: available === 'true',
      images: imageUrls, // Todas las imágenes
      mainImage, // Imagen principal seleccionada
      categories: categories || [], // Nuevo campo para categorías
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error: any) {
    console.error('Error al crear el producto:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear producto',
    });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, brand, description, price, stock, available, mainImageIndex, categories } = req.body;
    const images = req.files as Express.Multer.File[];

    // Subir nuevas imágenes a Cloudinary
    const newImageUrls = await Promise.all(
      images.map(async (file) => {
        try {
          const uploadResult = await uploadToCloudinary(file);
          return uploadResult.secure_url;
        } catch (error) {
          console.error('Error subiendo imagen a Cloudinary:', error);
          throw new Error('Error al subir imágenes');
        }
      })
    );

    // Obtener el producto existente
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Combinar las imágenes existentes con las nuevas
    const updatedImages = [...existingProduct.images, ...newImageUrls];

    // Determinar la imagen principal usando el índice enviado desde el frontend
    const mainImage = updatedImages[parseInt(mainImageIndex, 10)] || updatedImages[0];

    // Actualizar el producto
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        name,
        brand,
        description,
        price: Number(price),
        stock: Number(stock),
        available: available === 'true',
        images: updatedImages, // Todas las imágenes
        mainImage, // Imagen principal seleccionada
        categories: categories || [], // Nuevo campo para categorías
      },
      { new: true }
    );

    res.status(200).json(updatedProduct);
  } catch (error: any) {
    console.error('Error al actualizar el producto:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar producto',
    });
  }
};

export const deleteImage = async (req: Request, res: Response) => {
  try {
    const { id, imageIndex } = req.params;

    // Obtener el producto existente
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Eliminar la imagen del array de imágenes
    const updatedImages = product.images.filter((_, index) => index !== parseInt(imageIndex, 10));

    // Actualizar el producto
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        images: updatedImages,
        mainImage: updatedImages[0] || '', // Si se elimina la imagen principal, se asigna la primera imagen restante
      },
      { new: true }
    );

    res.status(200).json(updatedProduct);
  } catch (error: any) {
    console.error('Error al eliminar la imagen:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al eliminar la imagen',
    });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.status(200).json({ success: true, message: 'Producto eliminado' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al eliminar producto'
    });
  }
};