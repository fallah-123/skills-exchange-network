// Validates developer discovery search and pagination query parameters.
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SEARCH_MAX } from '../constants.js';
import { throwValidationErrors } from './common.validator.js';

/**
 * Validates developer list filters and returns normalized pagination values.
 * @param {object} query Raw query string parameters.
 * @returns {{search: string, page: number, limit: number}} Validated filters.
 * @throws {AppError} When a filter is invalid.
 */
export function validateDeveloperQuery(query = {}) {
  const errors = {};
  const search = query.search === undefined ? '' : query.search;
  if (typeof search !== 'string' || search.trim().length > SEARCH_MAX) {
    errors.search = 'Use no more than 50 characters.';
  }
  const page = parseQueryInteger(query.page, 'page', 1, 2147483647, errors);
  const limit = parseQueryInteger(query.limit, 'limit', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, errors);
  throwValidationErrors(errors);
  return { search: search.trim(), page, limit };
}

function parseQueryInteger(value, field, fallback, maximum, errors) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed) || parsed > maximum) {
    errors[field] = `Enter a positive integer no greater than ${maximum}.`;
  }
  return parsed;
}
