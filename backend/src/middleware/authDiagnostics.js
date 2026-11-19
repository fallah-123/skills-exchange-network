import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { authenticationDiagnostic } from '../utils/logger.js';

// Only fixed route labels and server-generated identifiers enter these records.
export default function authDiagnostics(write = authenticationDiagnostic) {
  return (req, res, next) => {
    const route = /^\/api\/auth\/(me|login)\/?$/i.exec(req.path)?.[1].toLowerCase();
    if (!((route === 'me' && req.method === 'GET') || (route === 'login' && req.method === 'POST'))) return next();
    const id = randomUUID();
    const started = performance.now();
    const base = { method: req.method, route: `/api/auth/${route}`, correlationId: id, expressProcessed: true };
    const emit = (fields) => {
      try {
        // Diagnostics must not interrupt responses even if a logging sink fails.
        Promise.resolve(write({ ...base, timestamp: new Date().toISOString(), ...fields })).catch(() => {});
      } catch { /* best-effort diagnostics */ }
    };
    res.setHeader('X-SDN-Auth-Request-Id', id);
    emit({ event: 'auth_request_received' });
    let recorded = false;
    const complete = (finished) => {
      if (recorded) return;
      recorded = true;
      emit({ event: finished ? 'auth_request_completed' : 'auth_request_aborted',
        status: finished ? res.statusCode : null,
        durationMs: Math.max(0, Math.round(performance.now() - started)) });
    };
    res.once('finish', () => complete(true));
    res.once('close', () => complete(res.writableFinished));
    next();
  };
}
