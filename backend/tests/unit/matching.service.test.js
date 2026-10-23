// Unit coverage for deterministic rule-based matching and ranking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMatch, rankMatches } from '../../src/services/matching.service.js';

const skill = (id, name) => ({ id, name });
const current = {
  id: 1,
  displayName: 'A',
  offered: [skill(1, 'React'), skill(2, 'Node.js')],
  wanted: [skill(3, 'Python'), skill(4, 'Docker'), skill(5, 'Go'), skill(6, 'Java')]
};

function candidate(id, displayName, offered, wanted) {
  return { id, displayName, offered, wanted };
}

test('scores worked examples and ranks mutual matches above one-way matches', () => {
  const candidates = [
    candidate(2, 'B', [skill(3, 'Python'), skill(4, 'Docker'), skill(5, 'Go'), skill(6, 'Java'), skill(7, 'Git')], [skill(1, 'React'), skill(2, 'Node.js')]),
    candidate(4, 'D', [skill(3, 'Python')], [skill(1, 'React'), skill(2, 'Node.js'), skill(8, 'Vue.js'), skill(9, 'Angular')]),
    candidate(5, 'E', [skill(3, 'Python'), skill(4, 'Docker'), skill(5, 'Go'), skill(6, 'Java')], [skill(10, 'Rust')]),
    candidate(7, 'G', [skill(11, 'PHP')], [skill(1, 'React')]),
    candidate(3, 'C', [skill(3, 'Python')], [skill(10, 'Rust')]),
    candidate(6, 'F', [skill(11, 'PHP')], [skill(10, 'Rust')])
  ];
  const matches = rankMatches(current, candidates);
  assert.deepEqual(matches.map(({ developer }) => developer.displayName), ['B', 'D', 'E', 'G', 'C']);
  assert.deepEqual(matches.map(({ score }) => score), [100, 38, 50, 50, 13]);
  assert.deepEqual(matches.map(({ matchType }) => matchType), ['mutual', 'mutual', 'they_offer', 'you_offer', 'they_offer']);
});

test('excludes the current developer and candidates without shared skill ids', () => {
  const self = candidate(1, 'A', current.offered, current.wanted);
  const unrelated = candidate(8, 'Other', [skill(30, 'React')], [skill(31, 'Rust')]);
  assert.deepEqual(rankMatches(current, [self, unrelated]), []);
  assert.equal(computeMatch(current, candidate(9, 'Empty', [], [])), null);
});

test('handles empty denominators without NaN and recognizes a skill in both lists', () => {
  const noWanted = { ...current, wanted: [] };
  const match = computeMatch(noWanted, candidate(2, 'B', [], [skill(1, 'React')]));
  assert.equal(match.score, 50);
  assert.equal(match.matchType, 'you_offer');
  const both = { ...current, offered: [skill(1, 'React')], wanted: [skill(1, 'React')] };
  assert.equal(computeMatch(both, candidate(2, 'B', [skill(1, 'React')], [skill(1, 'React')])).matchType, 'mutual');
});

test('returns deterministic order regardless of candidate input order', () => {
  const candidates = [
    candidate(3, 'Delta', [skill(3, 'Python')], []),
    candidate(2, 'beta', [skill(3, 'Python')], [])
  ];
  assert.deepEqual(rankMatches(current, candidates), rankMatches(current, candidates.slice().reverse()));
});

test('formats one, two, and three skill names in explanations', () => {
  const one = computeMatch(current, candidate(2, 'B', [skill(3, 'Python')], []));
  const two = computeMatch(current, candidate(3, 'C', [skill(3, 'Python'), skill(4, 'Docker')], []));
  const three = computeMatch(current, candidate(4, 'D', [skill(3, 'Python'), skill(4, 'Docker'), skill(5, 'Go')], []));
  assert.equal(one.explanation, 'They offer Python, which you want.');
  assert.equal(two.explanation, 'They offer Docker and Python, which you want.');
  assert.equal(three.explanation, 'They offer Docker, Go and Python, which you want.');
  const mutual = computeMatch(
    { id: 10, displayName: 'A', offered: [skill(1, 'React')], wanted: [skill(2, 'Python')] },
    candidate(11, 'B', [skill(2, 'Python')], [skill(1, 'React')])
  );
  assert.equal(mutual.explanation, 'Mutual match: they offer Python, which you want, and you offer React, which they want.');
  const youOffer = computeMatch(
    { id: 10, displayName: 'A', offered: [skill(1, 'React'), skill(2, 'Node.js'), skill(3, 'Go')], wanted: [] },
    candidate(12, 'C', [], [skill(1, 'React'), skill(2, 'Node.js'), skill(3, 'Go')])
  );
  assert.equal(youOffer.explanation, 'You offer Go, Node.js and React, which they want.');
});
