import express from 'express';
import { 
  getFullAvailability
} from '../controllers/availability.controller';

const router = express.Router();

router.get('/availability/full', getFullAvailability);

export default router;