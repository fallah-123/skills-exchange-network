import AppError from '../utils/AppError.js';
import * as repository from '../repositories/notifications.repository.js';
import { withTransaction } from '../db/transaction.js';

// Reads use one snapshot so a page and its count describe the same database state.
export async function list(pool, userId, query) {
  return withTransaction(pool, async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const result = await repository.list(client, userId, query);
    return { ...result, meta: { ...result.meta, userId, unreadCount: await repository.countUnread(client, userId) } };
  });
}
export async function count(pool, userId) {
  return { data: { unreadCount: await repository.countUnread(pool, userId) }, meta: { userId } };
}
async function mutation(pool, userId, action) {
  return withTransaction(pool, async client => {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const data = await action(client);
    return { data, meta: { userId, unreadCount: await repository.countUnread(client, userId) } };
  });
}
export function markRead(pool, userId, id, lastMessageId) {
  return mutation(pool, userId, async client => {
    const result = await repository.acknowledge(client, userId, id, lastMessageId);
    if (result === 'missing') throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'The notification was not found.');
    if (result === 'changed') throw new AppError(409, 'NOTIFICATION_UPDATED', 'New messages arrived. Review the updated notification.');
    return { id, read: true };
  });
}
export function markAllRead(pool, userId) {
  return mutation(pool, userId, async client => ({ markedCount: await repository.acknowledgeAll(client, userId) }));
}

export function clearOne(pool, userId, id, lastMessageId) {
  return mutation(pool, userId, async client => {
    const result = await repository.clearOne(client, userId, id, lastMessageId);
    if (result === 'missing') throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'The notification was not found.');
    if (result === 'changed') throw new AppError(409, 'NOTIFICATION_UPDATED', 'New messages arrived. Review the updated notification before clearing it.');
    return { clearedIds: [id], clearedCount: 1 };
  });
}
export function clearAll(pool, userId, readOnly) {
  return mutation(pool, userId, async client => {
    const clearedIds = await repository.clearSnapshot(client, userId, readOnly);
    return { clearedIds, clearedCount: clearedIds.length };
  });
}

export { recordMessage, recordRequest } from '../repositories/notifications.repository.js';
