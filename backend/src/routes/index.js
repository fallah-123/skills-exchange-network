// Mounts the API endpoints and exposes the public database health check.
import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { error as logError } from '../utils/logger.js';
import authRouter from './auth.routes.js';
import profileRouter from './profile.routes.js';
import skillsRouter from './skills.routes.js';
import developersRouter from './developers.routes.js';
import matchesRouter from './matches.routes.js';
import requestsRouter from './requests.routes.js';

const router = Router();

router.get('/health', asyncHandler(async (req, res) => {
  try {
    await req.app.locals.pool.query('SELECT 1');
  } catch (databaseError) {
    logError(databaseError);
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.');
  }
  res.status(200).json({ data: { status: 'ok', database: 'up' } });
}));

router.use('/auth', authRouter);
router.use('/profile', profileRouter);
router.use('/skills', skillsRouter);
router.use('/developers', developersRouter);
router.use('/matches', matchesRouter);
router.use('/requests', requestsRouter);

export default router;
