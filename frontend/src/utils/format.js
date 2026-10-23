// Formats server-provided profile values for readable, locale-aware presentation.

/** Capitalizes a known lower-case experience-level value. */
export function formatExperienceLevel(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : '';
}

/** Formats an ISO date using the browser's locale. */
export function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

/** Truncates text to a character limit with an ellipsis. */
export function truncate(value, limit) {
  if (!value || value.length <= limit) return value || '';
  return `${value.slice(0, limit - 1).trimEnd()}…`;
}
