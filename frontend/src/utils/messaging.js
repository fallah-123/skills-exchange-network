export const PRIVATE_MESSAGE_MAX = 2000;

export function messageLength(body) {
  return Array.from(body.trim()).length;
}

export function messageValidation(body) {
  if (!body.trim()) return 'Write a message first.';
  if (messageLength(body) > PRIVATE_MESSAGE_MAX) return 'Keep your message within 2,000 characters.';
  if (body.includes('\0') || (body.isWellFormed && !body.isWellFormed())) return 'Remove unsupported characters before sending.';
  return '';
}

// PostgreSQL bigint IDs must never be converted to JavaScript numbers.
export function mergeMessages(current, incoming) {
  const messages = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
}
