import {Router} from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireAdmin from '../middleware/requireAdmin.js';
import {issueMessagingCsrf,requireMessagingCsrf} from '../middleware/messagingCsrf.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as controller from '../controllers/verification.controller.js';
export function verificationRouter(admin=false) {
  const router=Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');req.verificationAdmin=admin;next();});
  router.use(requireAuth);
  if(admin) router.use(requireAdmin);
  router.get('/csrf-token',issueMessagingCsrf);
  router.get(admin?'/':'/me',asyncHandler(controller.list));
  router.get('/:id',asyncHandler(controller.detail));
  if(admin) {
    router.post('/:id/decision',requireMessagingCsrf,asyncHandler(controller.change));
    router.post('/:id/revoke',requireMessagingCsrf,asyncHandler(controller.change));
  } else {
    router.post('/',requireMessagingCsrf,asyncHandler(controller.submit));
    router.post('/:id/withdraw',requireMessagingCsrf,asyncHandler(controller.change));
  }
  return router;
}
