import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getSchedule, updateSchedule } from '../controllers/schedule.controller';

const router = express.Router();

router.get('/', getSchedule);
router.put('/', authMiddleware, updateSchedule);

export default router;