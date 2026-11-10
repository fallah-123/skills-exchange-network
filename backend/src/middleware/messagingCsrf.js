import { createHmac, timingSafeEqual } from 'node:crypto';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';

// A session-bound token avoids session-write races across tabs and workers.
// Login regenerates the session ID, invalidating tokens from previous sessions.
function tokenFor(req) {
  return createHmac('sha256', env.sessionSecret)
    .update(`messaging-csrf-v1:${req.sessionID}`)
    .digest('base64url');
}

export function issueMessagingCsrf(req, res) {
  res.json({ data: { csrfToken: tokenFor(req), userId: req.userId } });
}

export function requireMessagingCsrf(req, res, next) {
  const received = req.get('X-CSRF-Token');
  if (typeof received !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(received) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(tokenFor(req)))) {
    return next(new AppError(403, 'CSRF_INVALID', 'Refresh your messaging session and try again.'));
  }
  if (!req.is('application/json')) {
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send a JSON request body.'));
  }
  next();
}
