import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateModel, analyzeModel, applyPatch, diffModels, verifySource, nextId, isPatch,
} from '../src/index.js';

const prd = {
  document: 'prd.md',
  sections: [
    { id: '3.8', number: '3.8', heading: 'Grant Price', level: 2, text: 'Grant Price must be a non-negative decimal with up to 4 decimal places.' },
    { id: '4', number: '4', heading: 'Bulk Edit', level: 1, text: 'Admins can bulk edit the Vesting Schedule of selected grants.' },
  ],
};

const base = () => ({
  project: { name: 'Grants' },
  requirements: [
    { id: 'REQ-001', title: 'Grant price', classification: 'explicit', source: { section: '3.8', excerpt: 'Grant Price must be a non-negative decimal' } },
    { id: 'REQ-002', title: 'Bulk edit', classification: 'explicit', source: { section: '§4', excerpt: 'bulk edit the Vesting Schedule' } },
  ],
  validations: [
    { id: 'VAL-001', title: 'Non-negative', classification: 'explicit', requirementIds: ['REQ-001'], source: { section: '3.8' } },
    { id: 'VAL-002', title: 'Max 4 decimals', classification: 'explicit', requirementIds: ['REQ-001'], source: { section: '3.8', excerpt: 'up to 4 decimal places' } },
  ],
  testCases: [
    { id: 'TC-001', title: 'Reject negative', classification: 'derived', requirementIds: ['REQ-001'], validationIds: ['VAL-001'], steps: ['enter -1'], expectedResult: 'error', source: { requirementId: 'REQ-001' } },
  ],
  gaps: [
    { id: 'GAP-001', question: 'Can Grant Price be zero?', classification: 'ambiguous', relatedIds: ['REQ-001'], source: { requirementId: 'REQ-001' } },
  ],
});

test('valid model passes with warnings', () => {
  const r = validateModel(base(), { prd });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('REQ_UNCOVERED'));
  assert.ok(codes.includes('CHECK_UNTESTED'));
});

test('structural errors are reported', () => {
  const m = base();
  m.testCases.push({ id: 'TC-001', title: 'dup', requirementIds: ['REQ-999'] });
  m.requirements.push({ id: 'TC-777', title: 'wrong kind' });
  m.flows = [{ id: 'FLOW-1', title: 'bad id' }];
  const r = validateModel(m, { prd });
  const codes = r.errors.map((e) => e.code);
  assert.ok(codes.includes('ID_DUPLICATE'));
  assert.ok(codes.includes('ID_WRONG_KIND'));
  assert.ok(codes.includes('ID_INVALID'));
});

test('dangling references are errors', () => {
  const m = base();
  m.testCases[0].requirementIds.push('REQ-404');
  const r = validateModel(m, { prd });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'DANGLING_REF');
});

test('coverage: covered / partial / uncovered / ambiguous', () => {
  const a = analyzeModel(base(), { prd });
  assert.equal(a.coverage.perRequirement['REQ-001'].status, 'partial'); // VAL-002 untested
  assert.equal(a.coverage.perRequirement['REQ-001'].ambiguous, true);
  assert.equal(a.coverage.perRequirement['REQ-002'].status, 'uncovered');
  const m = base();
  m.validations.pop();
  assert.equal(analyzeModel(m, { prd }).coverage.perRequirement['REQ-001'].status, 'covered');
});

test('provenance verification', () => {
  assert.equal(verifySource(prd, { section: '3.8', excerpt: 'non-negative decimal' }).status, 'verified');
  assert.equal(verifySource(prd, { section: 'Grant Price', excerpt: 'Grant Price must … decimal' }).status, 'verified');
  assert.equal(verifySource(prd, { section: '3.8', excerpt: 'Admins can bulk edit' }).status, 'section-mismatch');
  assert.equal(verifySource(prd, { section: '3.8', excerpt: 'price may be negative in Narnia' }).status, 'excerpt-not-found');
  assert.equal(verifySource(prd, { section: '9.9' }).status, 'section-not-found');
  assert.equal(verifySource(prd, { requirementId: 'REQ-001' }).status, 'inherited');
  assert.equal(verifySource(prd, null).status, 'missing');
});

test('ambiguous items must link to a gap', () => {
  const m = base();
  m.requirements[1].classification = 'ambiguous';
  const r = validateModel(m, { prd });
  assert.ok(r.warnings.some((w) => w.code === 'AMBIGUOUS_WITHOUT_GAP' && w.id === 'REQ-002'));
});

test('patch: upsert, merge, remove strips references, diff', () => {
  const m = base();
  const p = {
    upsert: [{ id: 'TC-002', title: 'Accept zero?', requirementIds: ['REQ-001'], validationIds: ['VAL-002'] }],
    merge: [{ id: 'TC-001', expectedResult: 'Inline error "must be ≥ 0"' }],
    remove: ['VAL-001'],
  };
  assert.ok(isPatch(p));
  const { model, problems } = applyPatch(m, p);
  assert.equal(problems.length, 0);
  assert.deepEqual(model.testCases[0].validationIds, []);
  assert.equal(model.testCases[0].title, 'Reject negative');
  const d = diffModels(m, model);
  assert.deepEqual(d.added, ['TC-002']);
  assert.deepEqual(d.removed, ['VAL-001']);
  assert.ok(d.modified.includes('TC-001'));
  assert.equal(nextId(model, 'testCases'), 'TC-003');
  assert.equal(validateModel(model, { prd }).ok, true);
});

test('provenance works for non-Latin (Hebrew) PRDs and heading content', () => {
  const he = { sections: [
    { id: '3.8', heading: 'כללי פורמט', text: '| מחיר (Grant Price) | עשרוני עם סימן מטבע ($14.00), לא שלילי. יכול להיות 0 |' },
    { id: '3.3/2', heading: 'סינון לפי תוכנית, במידה וללקוח ישנן כמה תוכניות', text: '' },
  ] };
  assert.equal(verifySource(he, { section: '3.8', excerpt: 'לא שלילי. יכול להיות 0' }).status, 'verified');
  assert.equal(verifySource(he, { section: '3.8', excerpt: 'יכול להיות שלילי תמיד' }).status, 'excerpt-not-found');
  assert.equal(verifySource(he, { section: '3.3/2', excerpt: 'סינון לפי תוכנית' }).status, 'verified');
});
