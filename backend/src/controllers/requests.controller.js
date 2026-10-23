// Handles authenticated collaboration-request operations.
import * as service from '../services/requests.service.js';
import { validatePathId } from '../validators/common.validator.js';
import { validateCreateRequest, validateRequestStatus } from '../validators/requests.validator.js';
import { REQUEST_STATUS } from '../constants.js';

/**
 * Creates an outgoing collaboration request for the caller.
 * @param {import('express').Request} req Request creation payload.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the created request.
 * @throws {AppError} When input is invalid or the target cannot receive a request.
 */
export async function create(req, res) {
  const { recipientId, message } = validateCreateRequest(req.body);
  const result = await service.create(req.app.locals.pool, req.userId, recipientId, message);
  res.status(201).json({ data: result, message: 'Collaboration request sent.' });
}

/**
 * Lists caller-owned incoming requests with an optional validated status filter.
 * @param {import('express').Request} req Incoming request query.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends incoming requests.
 * @throws {AppError} When the status filter is invalid.
 */
export async function incoming(req, res) {
  const status = validateRequestStatus(req.query.status);
  const data = await service.list(req.app.locals.pool, req.userId, 'incoming', status);
  res.status(200).json({ data });
}

/**
 * Lists caller-owned outgoing requests with an optional validated status filter.
 * @param {import('express').Request} req Outgoing request query.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends outgoing requests.
 * @throws {AppError} When the status filter is invalid.
 */
export async function outgoing(req, res) {
  const status = validateRequestStatus(req.query.status);
  const data = await service.list(req.app.locals.pool, req.userId, 'outgoing', status);
  res.status(200).json({ data });
}

/**
 * Accepts a pending request addressed to the caller.
 * @param {import('express').Request} req Request decision URL.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the accepted request.
 * @throws {AppError} When the request is invalid, missing, or not pending.
 */
export async function accept(req, res) {
  const id = validatePathId(req.params.id);
  const data = await service.respond(req.app.locals.pool, id, req.userId, REQUEST_STATUS.ACCEPTED);
  res.status(200).json({ data, message: 'Request accepted.' });
}

/**
 * Rejects a pending request addressed to the caller.
 * @param {import('express').Request} req Request decision URL.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the rejected request.
 * @throws {AppError} When the request is invalid, missing, or not pending.
 */
export async function reject(req, res) {
  const id = validatePathId(req.params.id);
  const data = await service.respond(req.app.locals.pool, id, req.userId, REQUEST_STATUS.REJECTED);
  res.status(200).json({ data, message: 'Request rejected.' });
}
