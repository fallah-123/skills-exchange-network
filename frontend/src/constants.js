// Shared frontend validation limits, status labels, and timing defaults.
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 50;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const BIO_MAX = 500;
export const INTERESTS_MAX = 300;
export const URL_MAX = 255;
export const MESSAGE_MAX = 500;
export const SEARCH_MAX = 50;
export const MAX_ENTITY_ID = 2147483647;
export const MATCH_SCORE_MAX = 100;
export const DEVELOPER_CARD_SKILL_LIMIT = 5;
export const DASHBOARD_MATCH_LIMIT = 3;
export const MATCH_TYPE = Object.freeze({
  MUTUAL: 'mutual',
  THEY_OFFER: 'they_offer',
  YOU_OFFER: 'you_offer'
});
export const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
];
export const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
});
export const DEFAULT_PAGE_SIZE = 12;
export const SEARCH_DEBOUNCE_MS = 300;
export const TOAST_DURATION_MS = 5000;
