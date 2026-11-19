export function notificationText(item) {
  const name = item.actor.displayName;
  if(item.type==='verification_approved') return `${name} approved your skill evidence.`;
  if(item.type==='verification_rejected') return `${name} reviewed your skill evidence. View the feedback.`;
  if(item.type==='verification_revoked') return `${name} revoked your skill verification. View the reason.`;
  if (item.type === 'message') return item.eventCount === 1 ? `${name} sent you a message.` : `${name} sent you ${item.eventCount} new messages.`;
  if (item.type === 'request_received') return `${name} sent you a collaboration request.`;
  if (item.type === 'request_accepted') return `${name} accepted your collaboration request.`;
  if(item.type==='request_rejected') return `${name} declined your collaboration request.`;
  return 'You have a new update.';
}
export function notificationPath(item) {
  if(item.type.startsWith('verification_')) return `/verifications/${item.verificationId}`;
  if (item.type === 'message') return `/messages/${item.conversationId}`;
  return `/requests?tab=${item.type === 'request_received' ? 'incoming' : 'outgoing'}&requestId=${item.requestId}`;
}
export function relativeNotificationTime(value, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour');
  return formatter.format(-Math.floor(seconds / 86400), 'day');
}
