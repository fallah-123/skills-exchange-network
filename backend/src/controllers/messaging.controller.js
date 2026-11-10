import * as service from '../services/messaging.service.js';
import * as validator from '../validators/messaging.validator.js';
import { validatePathId } from '../validators/common.validator.js';

export async function open(req, res) {
  const requestId = validator.validateOpenConversation(req.body);
  const result = await service.openConversation(req.app.locals.pool, req.userId, requestId);
  res.status(result.created ? 201 : 200).json({ data: result.data });
}

export async function list(req, res) {
  res.json(await service.listConversations(req.app.locals.pool, req.userId, validator.validateConversationQuery(req.query)));
}

export async function get(req, res) {
  const id = validatePathId(req.params.id);
  res.json({ data: await service.getConversation(req.app.locals.pool, req.userId, id) });
}

export async function history(req, res) {
  const id = validatePathId(req.params.id);
  res.json(await service.listMessages(req.app.locals.pool, req.userId, id, validator.validateMessageQuery(req.query)));
}

export async function send(req, res) {
  const id = validatePathId(req.params.id);
  const fields = validator.validateSendMessage(req.body);
  const result = await service.sendMessage(req.app.locals.pool, req.userId, id, fields);
  res.status(result.created ? 201 : 200).json({ data: result.data, meta: { replayed: !result.created } });
}
