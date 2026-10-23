// Shared validation limits, enums, and pagination defaults for the backend.

/** Minimum and maximum display-name lengths accepted by the API. */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 50;
/** Maximum email length accepted by the API. */
export const EMAIL_MAX = 254;
/** Minimum and maximum password lengths accepted by the API. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Maximum lengths for profile text, URLs, messages, and developer searches. */
export const BIO_MAX = 500;
export const INTERESTS_MAX = 300;
export const URL_MAX = 255;
export const MESSAGE_MAX = 500;
export const SEARCH_MAX = 50;
/** Allowed profile experience levels. */
export const EXPERIENCE_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced']);
/** Allowed developer skill categories. */
export const SKILL_TYPES = Object.freeze(['offered', 'wanted']);
/** Collaboration request state values. */
export const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
});
/** Session cookie name and maximum age. */
export const SESSION_COOKIE_NAME = 'sdn.sid';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Default and maximum result counts for paginated APIs. */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_MATCH_LIMIT = 20;
export const MAX_MATCH_LIMIT = 50;
