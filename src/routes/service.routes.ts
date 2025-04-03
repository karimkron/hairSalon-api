import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  createService, 
  getServices, 
  updateService, 
  deleteService,
  getServiceCategories,
  addServiceCategory
} from '../controllers/service.controller';
import multer from 'multer';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10MB
});


const router = express.Router();

// Rutas protegidas
router.post('/services', authMiddleware, upload.single('image'), (req, _, next) => {
    console.log("Solicitud POST /services recibida");
    console.log("Body:", req.body);
    console.log("Archivo:", req.file);
    next();
  },
  createService
);


router.get('/services', getServices);

router.put(
  '/services/:id',
  authMiddleware,
  upload.single('image'), // Campo para actualizar archivo
  updateService
);

router.delete('/services/:id', authMiddleware, deleteService);

// Nuevas rutas para categorías de servicios
router.get('/services/categories', getServiceCategories);
router.post('/services/categories', authMiddleware, addServiceCategory);

export default router;