import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, suggestions, matchRanges, snippet, normalize } from './search.js';

const t = (key, vars) => (vars ? `${key}:${Object.values(vars).join(',')}` : key);

const pad = (n) => String(n).padStart(3, '0');
const state = {
  model: {
    requirements: [
      { id: 'REQ-003', title: 'Unit Price לא שלילי', description: 'The price must be zero or more', classification: 'explicit' },
      { id: 'REQ-011', title: 'Export orders', description: 'Export to CSV from the Pending tab', classification: 'derived' },
    ],
    testCases: [
      { id: 'TC-001', title: 'Export happy path', type: 'happy-path', steps: ['Open Pending', { action: 'Click Export', expected: 'CSV downloads' }] },
      { id: 'TC-002', title: 'Unit Price = -5 נחסם', type: 'negative', expectedResult: 'ערך שלילי נחסם' },
      ...Array.from({ length: 7 }, (_, i) => ({ id: `TC-0${pad(i + 10).slice(1)}`, title: `Filter case ${i}`, type: 'filter' })),
    ],
    gaps: [{ id: 'GAP-001', question: 'מה קורה כשהמחיר הוא אפס?', status: 'open' }],
    validations: [{ id: 'VAL-001', title: 'Price validation', description: 'Unit Price must not be negative' }],
  },
  analysis: { coverage: { perRequirement: { 'REQ-003': { status: 'covered' }, 'REQ-011': { status: 'uncovered' } } } },
  feedback: [{ id: 'FB-001', message: 'Missing export test', status: 'open', thread: [{ message: 'Added TC-001' }] }],
};
const prd = {
  sections: [
    { id: '3.8', heading: 'כללי פורמט', text: 'Unit Price: לא שלילי. יכול להיות 0' },
    { id: '3.1', heading: 'Overview', text: 'The orders module…' },
    { id: '5.4', heading: 'שָׁלוֹם עולם', text: 'Export uses 3.8 formats' },
  ],
};
const index = buildIndex(state, prd, t, { langs: ['en', 'he'], lang: 'en' });
const flat = (r) => r.groups.flatMap((g) => g.rows.map((x) => x.item.id || x.item.title));

test('ID prefix ranks test cases first', () => {
  const r = search(index, 'tc-00');
  assert.equal(r.groups[0].group, 'testCases');
  assert.deepEqual(r.groups[0].rows.map((x) => x.item.id).slice(0, 2), ['TC-001', 'TC-002']);
});

test('exact ID wins over prefix matches', () => {
  const r = search(index, 'TC-002');
  assert.equal(flat(r)[0], 'TC-002');
});

test('§3.8 and 3.8 put the PRD section on top', () => {
  for (const q of ['§3.8', '3.8', '§ 3.8']) {
    const r = search(index, q);
    assert.equal(r.groups[0].group, 'prd', q);
    assert.equal(r.groups[0].rows[0].item.id, '3.8', q);
  }
});

test('every token must match (AND semantics)', () => {
  assert.deepEqual(flat(search(index, 'unit price')).filter((id) => /^(REQ|TC|VAL)/.test(id)).sort(), ['REQ-003', 'TC-002', 'VAL-001']);
  assert.deepEqual(flat(search(index, 'price csv')), []);
  assert.ok(flat(search(index, 'export csv')).includes('REQ-011'));
});

test('title hits outrank description hits; boosted kinds break ties', () => {
  // "Price validation" starts with the query (+200) and beats a title-word hit.
  assert.deepEqual(search(index, 'price').groups.map((g) => g.group).slice(0, 2), ['validations', 'requirements']);
  const title = search(index, 'export');
  assert.equal(title.groups[0].rows[0].item.id, 'REQ-011'); // title "Export orders" (+200 prefix) in a boosted kind
  assert.deepEqual(title.groups.find((g) => g.group === 'testCases').rows.map((x) => x.item.id), ['TC-001']); // title hit; FB/desc hits rank lower
});

test('Hebrew matching ignores niqqud in both query and content', () => {
  assert.ok(flat(search(index, 'שלילי')).includes('REQ-003'));
  assert.ok(flat(search(index, 'שלום')).includes('5.4'));
  assert.ok(flat(search(index, 'שָׁלוֹם')).includes('5.4'));
  assert.equal(normalize('שָׁלוֹם'), 'שלום');
});

test('groups show at most 5 rows, with the rest behind "Show all"', () => {
  const r = search(index, 'filter');
  const g = r.groups.find((x) => x.group === 'testCases');
  assert.equal(g.total, 7);
  assert.equal(g.rows.length, 5);
  assert.equal(g.more, 2);
  const all = search(index, 'filter', { expanded: new Set(['testCases']) }).groups.find((x) => x.group === 'testCases');
  assert.equal(all.rows.length, 7);
  assert.equal(all.more, 0);
});

test('snippet comes from the matched field when the hit is not in the ID or title', () => {
  const row = search(index, 'downloads').groups[0].rows[0];
  assert.equal(row.item.id, 'TC-001');
  assert.match(row.snippet, /CSV downloads/);
  assert.equal(search(index, 'export').groups[0].rows[0].snippet, null);
  assert.equal(snippet('a '.repeat(100) + 'needle here', 'needle').startsWith('…'), true);
});

test('feedback threads and commands are searchable', () => {
  assert.ok(flat(search(index, 'added tc-001')).includes('FB-001'));
  const cmd = search(index, 'language.switchTo').groups.find((g) => g.group === 'commands');
  assert.equal(cmd.rows[0].item.target.lang, 'he');
});

test('match ranges map back through niqqud', () => {
  const s = 'שָׁלוֹם world';
  const [[a, b]] = matchRanges(s, ['שלום']);
  assert.equal(s.slice(a, b), 'שָׁלוֹם');
  assert.deepEqual(matchRanges('Unit Price', ['price', 'un']), [[0, 2], [5, 10]]);
});

test('empty query: jump to, recent and needs attention', () => {
  const r = suggestions(index, state, ['TC-002', 'NOPE-1']);
  assert.deepEqual(r.groups.map((g) => g.group), ['jumpTo', 'recent', 'attention']);
  assert.deepEqual(r.groups[1].rows.map((x) => x.item.id), ['TC-002']);
  assert.deepEqual(r.groups[2].rows.map((x) => x.item.id), ['GAP-001', 'REQ-011', 'FB-001']);
});

test('fast enough: 300 entities + 250 sections under 16ms per query', () => {
  const big = { ...state, model: { testCases: Array.from({ length: 300 }, (_, i) => ({ id: `TC-${i}`, title: `Test ${i} unit price boundary`, description: 'lorem ipsum '.repeat(20), steps: ['a', 'b', 'c'] })) } };
  const bigPrd = { sections: Array.from({ length: 250 }, (_, i) => ({ id: `${i}.1`, heading: `Section ${i}`, text: 'טקסט '.repeat(80) })) };
  const idx = buildIndex(big, bigPrd, t);
  search(idx, 'warm');
  const start = performance.now();
  for (const q of ['g', 'gr', 'gra', 'unit', 'unit p', 'unit pr', 'unit price']) search(idx, q);
  assert.ok((performance.now() - start) / 7 < 16);
});
