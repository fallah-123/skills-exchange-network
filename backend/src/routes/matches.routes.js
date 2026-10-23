// Maps the protected matching endpoint to its controller.
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/matches.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(controller.list));
export default router;
