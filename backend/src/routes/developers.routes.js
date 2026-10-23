// Maps authenticated developer discovery endpoints to controller methods.
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/developers.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.get));
export default router;
