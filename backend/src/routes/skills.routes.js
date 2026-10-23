// Maps protected catalogue and own skill-list routes to the shared controller.
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/skills.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(controller.listCatalogue));
router.get('/me', asyncHandler(controller.listMine));
router.post('/me/:skillType', asyncHandler(controller.add));
router.delete('/me/:skillType/:skillId', asyncHandler(controller.remove));
export default router;
