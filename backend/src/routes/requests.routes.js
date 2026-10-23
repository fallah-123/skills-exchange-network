// Maps authenticated collaboration-request operations to controller functions.
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/requests.controller.js';

const router = Router();
router.use(requireAuth);
router.post('/', asyncHandler(controller.create));
router.get('/incoming', asyncHandler(controller.incoming));
router.get('/outgoing', asyncHandler(controller.outgoing));
router.post('/:id/accept', asyncHandler(controller.accept));
router.post('/:id/reject', asyncHandler(controller.reject));
export default router;
