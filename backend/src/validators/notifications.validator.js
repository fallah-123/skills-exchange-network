import { throwValidationErrors } from './common.validator.js';
const validId = value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;

export function notificationId(value) {
  if (!validId(value)) throwValidationErrors({ id: 'Use a valid notification ID.' });
  return value;
}

export function notificationQuery(query) {
  const errors = {};
  let cursor;
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^[1-9]\d?$/.test(query.limit) || limit > 50)) errors.limit = 'Use a limit from 1 to 50.';
  if (query.unread !== undefined && !['true', 'false'].includes(query.unread)) errors.unread = 'Use true or false.';
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      if (!cursor || !validId(cursor.id) || typeof cursor.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor.at) ||
          Number(cursor.at.slice(0, 4)) < 1 || !Number.isFinite(Date.parse(cursor.at)) || new Date(cursor.at).toISOString() !== cursor.at.slice(0, 23) + 'Z') throw new Error();
    } catch { errors.cursor = 'Use a valid notification cursor.'; }
  }
  for (const key of Object.keys(query)) if (!['limit', 'cursor', 'unread'].includes(key)) errors.query = 'Unsupported query field.';
  throwValidationErrors(errors);
  return { limit, cursor, unread: query.unread === 'true' };
}

export function readBody(body, all = false) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) errors.body = 'Send a JSON object.';
  else {
    for (const key of Object.keys(body)) if (all || key !== 'lastMessageId') errors.body = 'Unsupported field.';
    if (!all && body.lastMessageId !== null && !validId(body.lastMessageId)) errors.lastMessageId = 'Provide the displayed latest message ID, or null for a request.';
  }
  throwValidationErrors(errors);
  return body.lastMessageId ?? null;
}
