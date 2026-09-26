import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findIssues, findStale } from '../scripts/watch-upstream.mjs';

const reference = JSON.parse(
  await readFile(new URL('../public/data/reference.json', import.meta.url), 'utf8'),
);
const index = {
  seasons: [
    { season: 'M6', dates: ['26_09_2026'], formats: ['Singles'] },
    { season: 'M5', dates: ['10_09_2026'], formats: ['Singles'] },
  ],
  pokemon: {},
};
// 랭킹 자료 모양: 이름 → 기술·도구 채용률.
const snapshot = pokemon => ({ pokemon });
const garchomp = { move: [['Earthquake', 90, 1]], held_item: [['Choice Scarf', 30, 1]] };

test('a ranking the reference already knows raises nothing', () => {
  assert.deepEqual(findStale(reference, index, snapshot({ Garchomp: garchomp })), {
    missing: [],
    items: [],
    moves: [],
  });
  const issues = findIssues({
    reference,
    index,
    snapshots: { Singles: snapshot({ Garchomp: garchomp }) },
    regulations: { M6: 'M-C' },
    upstream: { showdown: [], champout: [] },
  });
  assert.deepEqual(issues, []);
});

test('new pokemon, moves, items, a season without a regulation and upstream commits are reported once each', () => {
  const stale = snapshot({
    Garchomp: {
      move: [
        ['Earthquake', 90, 1],
        ['Spore', 5, 2],
      ],
      held_item: [['Z Crystal Test', 1, 1]],
    },
    Fakemon: { move: [], held_item: [] },
  });
  const found = findStale(reference, index, stale);
  assert.deepEqual(found.missing, ['Fakemon']);
  assert.deepEqual(found.moves, ['Garchomp: Spore'], '배울 수 없다고 본 기술');
  assert.deepEqual(found.items, ['Z Crystal Test']);
  const commit = {
    sha: 'abc1234567',
    date: '2026-10-11',
    message: 'Champions: Regulation M-D learnsets',
  };
  const issues = findIssues({
    reference,
    index,
    snapshots: { Singles: stale, Doubles: stale },
    regulations: { M5: 'M-B' },
    upstream: { showdown: [commit], champout: [] },
  });
  assert.deepEqual(
    issues.map(issue => issue.key),
    ['regulation:M6', 'missing:M6', 'moves:M6', 'items:M6', 'showdown:abc1234567'],
    '싱글·더블에서 같은 문제는 한 건으로 합친다',
  );
  assert.match(issues[1].text, /싱글 랭킹[^\n]*Fakemon\n[^\n]*더블 랭킹/);
  assert.match(issues[4].text, /Regulation M-D learnsets/);
});
