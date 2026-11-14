import * as service from '../services/notifications.service.js';
import * as validator from '../validators/notifications.validator.js';
export async function list(req, res) { res.json(await service.list(req.app.locals.pool, req.userId, validator.notificationQuery(req.query))); }
export async function count(req, res) { res.json(await service.count(req.app.locals.pool, req.userId)); }
export async function read(req, res) {
  res.json(await service.markRead(req.app.locals.pool, req.userId, validator.notificationId(req.params.id), validator.readBody(req.body)));
}
export async function readAll(req, res) {
  validator.readBody(req.body, true);
  res.json(await service.markAllRead(req.app.locals.pool, req.userId));
}
export async function clearOne(req, res) {
  res.json(await service.clearOne(req.app.locals.pool, req.userId, validator.notificationId(req.params.id), validator.readBody(req.body)));
}
export async function clearRead(req, res) {
  validator.readBody(req.body, true);
  res.json(await service.clearAll(req.app.locals.pool, req.userId, true));
}
export async function clearAll(req, res) {
  validator.readBody(req.body, true);
  res.json(await service.clearAll(req.app.locals.pool, req.userId, false));
}
