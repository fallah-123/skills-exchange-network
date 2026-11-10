import {
  CHAT_MESSAGE_MAX, CHAT_PAGE_SIZE, CHAT_MAX_PAGE_SIZE, CONVERSATION_PAGE_SIZE, MAX_PAGE_SIZE
} from '../constants.js';
import { isValidId, throwValidationErrors } from './common.validator.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BIGINT = 9223372036854775807n;

function objectBody(body, allowed, errors) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object.';
    return {};
  }
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors.body = 'The request contains unsupported fields.';
  }
  return body;
}

function integerQuery(value, name, fallback, max, errors) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > max) {
    errors[name] = `Use an integer from 1 to ${max}.`;
    return fallback;
  }
  return Number(value);
}

function messageCursor(value, field, errors) {
  if (value === undefined) return undefined;
  const pattern = field === 'after' ? /^(0|[1-9]\d{0,18})$/ : /^[1-9]\d{0,18}$/;
  if (typeof value !== 'string' || !pattern.test(value) || BigInt(value) > MAX_BIGINT) {
    errors[field] = 'Use a valid message ID as a decimal string.';
    return undefined;
  }
  return value;
}

export function validateOpenConversation(body) {
  const errors = {};
  const fields = objectBody(body, ['requestId'], errors);
  if (!isValidId(fields.requestId)) errors.requestId = 'Choose a valid collaboration request.';
  throwValidationErrors(errors);
  return fields.requestId;
}

export function validateSendMessage(body) {
  const errors = {};
  const fields = objectBody(body, ['body', 'clientMessageId'], errors);
  const text = typeof fields.body === 'string' ? fields.body.trim() : '';
  // PostgreSQL rejects NUL and unpaired surrogates cannot round-trip through UTF-8.
  const invalidUnicode = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
  if (!text || Array.from(text).length > CHAT_MESSAGE_MAX || text.includes('\0') || invalidUnicode.test(text)) {
    errors.body = `Use 1 to ${CHAT_MESSAGE_MAX} valid text characters.`;
  }
  if (typeof fields.clientMessageId !== 'string' || !UUID.test(fields.clientMessageId)) {
    errors.clientMessageId = 'Provide a UUID for this message and reuse it when retrying.';
  }
  throwValidationErrors(errors);
  return { body: text, clientMessageId: fields.clientMessageId.toLowerCase() };
}

export function validateConversationQuery(query = {}) {
  const errors = {};
  const page = integerQuery(query.page, 'page', 1, 10_000, errors);
  const limit = integerQuery(query.limit, 'limit', CONVERSATION_PAGE_SIZE, MAX_PAGE_SIZE, errors);
  throwValidationErrors(errors);
  return { page, limit };
}

export function validateMessageQuery(query = {}) {
  const errors = {};
  const limit = integerQuery(query.limit, 'limit', CHAT_PAGE_SIZE, CHAT_MAX_PAGE_SIZE, errors);
  const before = messageCursor(query.before, 'before', errors);
  const after = messageCursor(query.after, 'after', errors);
  if (query.before !== undefined && query.after !== undefined) errors.cursor = 'Use either before or after, not both.';
  throwValidationErrors(errors);
  return { limit, before, after };
}
