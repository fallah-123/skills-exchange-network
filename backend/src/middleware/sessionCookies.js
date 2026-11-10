import AppError from '../utils/AppError.js';

// Vercel proxies /api on the frontend origin, so cross-site cookies are unnecessary.
// Reuse the same scope and flags when creating, upgrading and clearing a cookie.
export function sessionCookieOptions(nodeEnv) {
  return Object.freeze({ path: '/', httpOnly: true, secure: nodeEnv === 'production', sameSite: 'lax' });
}

export function requireProductionHttps(req, res, next) {
  // Hosting health probes can use internal HTTP and do not authenticate users.
  const healthProbe = ['GET', 'HEAD'].includes(req.method) && req.path === '/api/health';
  if (!req.secure && !healthProbe) {
    return next(new AppError(400, 'HTTPS_REQUIRED', 'Use HTTPS to access this service.'));
  }
  next();
}

export function upgradeSessionCookie(req, res, next) {
  if (!req.session?.userId) return next();
  const policy = req.app.locals.sessionCookieOptions;
  // Internal HTTP health probes must not consume an upgrade whose Secure cookie
  // cannot be delivered on that connection.
  if (policy.secure && !req.secure) return next();
  const changed = Object.entries(policy).some(([key, value]) => req.session.cookie[key] !== value);
  if (changed) {
    Object.assign(req.session.cookie, policy);
    // express-session ignores cookie-only changes when deciding to save and issue
    // Set-Cookie. A server-owned revision ensures both happen once per upgrade.
    // Keep the session ID/user data so open tabs and messaging CSRF tokens survive.
    req.session.cookiePolicyRevision = (Number.isSafeInteger(req.session.cookiePolicyRevision)
      ? req.session.cookiePolicyRevision : 0) + 1;
  }
  next();
}
