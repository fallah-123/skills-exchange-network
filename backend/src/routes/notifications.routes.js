import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { issueMessagingCsrf, requireMessagingCsrf } from '../middleware/messagingCsrf.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/notifications.controller.js';
const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(requireAuth);
// Reuse the existing session-bound token protocol without changing messaging.
router.get('/csrf-token', issueMessagingCsrf);
router.get('/unread-count', asyncHandler(controller.count));
router.get('/', asyncHandler(controller.list));
router.post('/read-all', requireMessagingCsrf, asyncHandler(controller.readAll));
router.post('/:id/read', requireMessagingCsrf, asyncHandler(controller.read));
router.delete('/read', requireMessagingCsrf, asyncHandler(controller.clearRead));
router.delete('/', requireMessagingCsrf, asyncHandler(controller.clearAll));
router.delete('/:id', requireMessagingCsrf, asyncHandler(controller.clearOne));
export default router;
