import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { issueMessagingCsrf, requireMessagingCsrf } from '../middleware/messagingCsrf.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/messaging.controller.js';

const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(requireAuth);
router.get('/csrf-token', issueMessagingCsrf);
router.get('/', asyncHandler(controller.list));
router.post('/', requireMessagingCsrf, asyncHandler(controller.open));
router.get('/:id', asyncHandler(controller.get));
router.get('/:id/messages', asyncHandler(controller.history));
router.post('/:id/messages', requireMessagingCsrf, asyncHandler(controller.send));
export default router;
