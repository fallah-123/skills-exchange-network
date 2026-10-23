// Maps authenticated own-profile URLs to profile controller actions.
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/profile.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/me', asyncHandler(controller.getOwnProfile));
router.put('/me', asyncHandler(controller.updateOwnProfile));
export default router;
