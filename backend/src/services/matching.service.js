// Provides deterministic, pure skill-id coverage matching and ranking functions.
function sortSkills(skills) {
  return skills.slice().sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id - right.id);
}

function joinNames(skills) {
  const names = skills.map(({ name }) => name);
  if (names.length < 2) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * Computes exact skill-id coverage and explanation for one developer candidate.
 * @param {object} currentUser Caller with offered and wanted skills.
 * @param {object} candidate Candidate with offered and wanted skills.
 * @returns {object|null} Match fields or null if there is no relationship.
 * @throws {TypeError} If input skill collections are not arrays.
 */
export function computeMatch(currentUser, candidate) {
  if (currentUser.id === candidate.id) return null;
  const offeredIds = new Set(currentUser.offered.map(({ id }) => id));
  const wantedIds = new Set(currentUser.wanted.map(({ id }) => id));
  const theirOffers = candidate.offered.filter(({ id }) => wantedIds.has(id));
  const theirWants = candidate.wanted.filter(({ id }) => offeredIds.has(id));
  if (!theirOffers.length && !theirWants.length) return null;
  const type = theirOffers.length && theirWants.length ? 'mutual' : theirOffers.length ? 'they_offer' : 'you_offer';
  const forward = wantedIds.size ? theirOffers.length / wantedIds.size : 0;
  const reverse = candidate.wanted.length ? theirWants.length / candidate.wanted.length : 0;
  const score = Math.round(100 * (forward + reverse) / 2);
  const sortedTheirOffers = sortSkills(theirOffers);
  const sortedTheirWants = sortSkills(theirWants);
  const theyNames = joinNames(sortedTheirOffers);
  const youNames = joinNames(sortedTheirWants);
  const explanation = type === 'mutual'
    ? `Mutual match: they offer ${theyNames}, which you want, and you offer ${youNames}, which they want.`
    : type === 'they_offer'
      ? `They offer ${theyNames}, which you want.`
      : `You offer ${youNames}, which they want.`;
  return {
    developer: {
      id: candidate.id,
      displayName: candidate.displayName,
      bio: candidate.bio ?? null,
      experienceLevel: candidate.experienceLevel ?? null
    },
    score,
    matchType: type,
    theyOfferYouWant: sortedTheirOffers,
    youOfferTheyWant: sortedTheirWants,
    explanation
  };
}

/**
 * Filters and deterministically ranks candidates using match tier, score, overlap, name, and id.
 * @param {object} currentUser Caller with offered and wanted skills.
 * @param {object[]} candidates Candidate users.
 * @returns {object[]} Ranked matches without the caller.
 * @throws {TypeError} If input skill collections are not arrays.
 */
export function rankMatches(currentUser, candidates) {
  const tier = { mutual: 0, they_offer: 1, you_offer: 1 };
  return candidates
    .map((candidate) => computeMatch(currentUser, candidate))
    .filter(Boolean)
    .sort((left, right) =>
      tier[left.matchType] - tier[right.matchType] ||
      right.score - left.score ||
      (right.theyOfferYouWant.length + right.youOfferTheyWant.length) -
        (left.theyOfferYouWant.length + left.youOfferTheyWant.length) ||
      left.developer.displayName.localeCompare(right.developer.displayName, undefined, { sensitivity: 'base' }) ||
      left.developer.id - right.developer.id);
}
