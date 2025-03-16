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
    const { name, brand, description, price, stock, available } = req.body;
    let imageUrl = '';

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file);
      imageUrl = uploadResult.secure_url;
    }

    const newProduct = new Product({
      name,
      brand,
      description,
      price: Number(price),
      stock: Number(stock),
      available: available === 'true',
      image: imageUrl
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear producto"
    });
  }
};


export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, brand, description, price, stock, available } = req.body;
    let imageUrl = req.body.imageUrl;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file);
      imageUrl = uploadResult.secure_url;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        name,
        brand,
        description,
        price: Number(price),
        stock: Number(stock),
        available: available === 'true',
        image: imageUrl
      },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.status(200).json(updatedProduct);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar producto'
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