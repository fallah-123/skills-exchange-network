import AppError from '../utils/AppError.js';
import { withTransaction } from '../db/transaction.js';
import { CHAT_SEND_LIMIT, CHAT_SEND_WINDOW_MS } from '../constants.js';
import * as repository from '../repositories/messaging.repository.js';

const conversationMissing = () => new AppError(404, 'CONVERSATION_NOT_FOUND', 'The conversation was not found.');

async function messagingTransaction(pool, action) {
  try {
    return await withTransaction(pool, async (client) => {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      return action(client);
    });
  } catch (error) {
    if (['55P03', '57014', '40P01'].includes(error.code)) {
      const busy = new AppError(503, 'MESSAGING_BUSY', 'Messaging is busy. Retry your request shortly.');
      busy.retryAfter = 1;
      throw busy;
    }
    throw error;
  }
}

export async function openConversation(pool, userId, requestId) {
  return messagingTransaction(pool, async (client) => {
    const connection = await repository.findConnection(client, userId, requestId);
    if (!connection) throw new AppError(404, 'CONNECTION_NOT_FOUND', 'The connection was not found.');
    if (connection.status !== 'accepted') throw new AppError(409, 'CONNECTION_NOT_ACCEPTED', 'Accept the collaboration request before messaging.');
    const opened = await repository.openConversation(client, requestId);
    const data = await repository.findConversation(client, userId, opened.id);
    if (!data) throw conversationMissing();
    return { data, created: opened.created };
  });
}

export async function getConversation(pool, userId, id) {
  const data = await repository.findConversation(pool, userId, id);
  if (!data) throw conversationMissing();
  return data;
}

export async function listConversations(pool, userId, query) {
  const result = await repository.listConversations(pool, userId, query);
  return { data: result.data, meta: { ...query, hasMore: result.hasMore } };
}

export async function listMessages(pool, userId, id, query) {
  await getConversation(pool, userId, id);
  const { data, hasMore } = await repository.listMessages(pool, id, query);
  return {
    data,
    meta: {
      limit: query.limit, hasMore,
      nextBefore: query.after === undefined && hasMore ? data[0].id : null,
      nextAfter: query.before !== undefined ? null : data.at(-1)?.id ?? query.after ?? '0'
    }
  };
}

export async function sendMessage(pool, userId, id, fields) {
  return messagingTransaction(pool, async (client) => {
    // Lock before allocating a message ID: later IDs in this conversation cannot
    // commit before earlier ones, so incremental history reads do not skip sends.
    if (!await repository.findConversation(client, userId, id, true)) throw conversationMissing();
    const existing = await repository.findRetry(client, id, userId, fields.clientMessageId);
    if (existing) {
      if (existing.body !== fields.body) throw new AppError(409, 'MESSAGE_ID_REUSED', 'This message identifier was already used for different text.');
      return { data: existing, created: false };
    }
    await repository.lockSender(client, userId);
    const recent = await repository.recentSends(client, userId, CHAT_SEND_WINDOW_MS, CHAT_SEND_LIMIT);
    if (recent.length >= CHAT_SEND_LIMIT) {
      const oldest = recent.at(-1);
      const error = new AppError(429, 'MESSAGE_RATE_LIMITED', 'You are sending messages too quickly. Please wait and try again.');
      error.retryAfter = Math.max(1, Math.ceil((oldest.created_at.getTime() + CHAT_SEND_WINDOW_MS - oldest.checked_at.getTime()) / 1000));
      throw error;
    }
    return { data: await repository.insertMessage(client, id, userId, fields), created: true };
  });
}
