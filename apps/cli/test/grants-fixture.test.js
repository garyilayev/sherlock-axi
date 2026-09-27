// Golden fixture: the real Grants Module PRD (Hebrew .docx) + its human QA guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPrd } from '../src/prd/extract.js';
import { evaluateGolden, verifySource, resolveSection } from '@sherlock/qa-model';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/grants');
const golden = JSON.parse(fs.readFileSync(path.join(dir, 'golden.json'), 'utf8'));
const prd = await extractPrd(path.join(dir, golden.prd));

test('docx extraction: every section the QA guide relies on is present', () => {
  for (const id of golden.prdSections) assert.ok(resolveSection(prd, id), `§${id} missing`);
  assert.ok(prd.words > 9000);
  assert.ok(!prd.sections.some((s) => /^TOC/.test(s.heading)), 'TOC entries leaked into sections');
});

test('docx extraction: numbering heuristics', () => {
  assert.equal(resolveSection(prd, '6').heading, 'מסך Outstanding'); // unnumbered heading inferred from 6.1
  assert.match(resolveSection(prd, '6.3').heading, /^טאב Expiring Soon/); // "6.3 . טאב" cleaned
  assert.equal(resolveSection(prd, '11').heading, 'Logs – יומן פעולות (Audit Trail)'); // stray "11." inside §9.4 ignored
  assert.equal(resolveSection(prd, '3.4-2').heading, 'טבלת הנתונים'); // duplicate typed number disambiguated
});

test('provenance verifies Hebrew excerpts inside tables and headings', () => {
  assert.equal(verifySource(prd, { section: '3.8', excerpt: 'לא שלילי. יכול להיות 0' }).status, 'verified');
  assert.equal(verifySource(prd, { section: '3.3/5', excerpt: 'זמין לאחר proposed' }).status, 'verified');
  assert.equal(verifySource(prd, { section: '5.4', excerpt: 'Grant Price must be positive' }).status, 'excerpt-not-found');
  assert.equal(verifySource(prd, { section: '5.4', excerpt: 'Delete Exhibit & Return Grants to Drafts' }).status, 'section-mismatch');
});

test('golden evaluator scores concept recall', () => {
  const empty = evaluateGolden({ project: { name: 'x' } }, golden);
  assert.equal(empty.pass, false);
  const model = {
    project: { name: 'Grants' },
    requirements: [
      { id: 'REQ-001', title: 'Void', description: 'Void a Draft grant; Show Voided + Restore (back under its exhibit)' },
      { id: 'REQ-002', title: 'Grant Price', description: 'Grant Price לא שלילי, יכול להיות 0' },
    ],
    gaps: Array.from({ length: 5 }, (_, i) => ({ id: `GAP-00${i + 1}`, question: '?' })),
  };
  const r = evaluateGolden(model, golden);
  const hit = (id) => r.concepts.find((c) => c.id === id).hit;
  assert.ok(hit('void') && hit('restore') && hit('show-voided') && hit('grant-price') && hit('open-questions'));
  assert.ok(!hit('delete-exhibit'));
});

test('golden concepts need the behaviour, not just the feature name', () => {
  const names = ['Void', 'Restore', 'Distribute', 'Create Exhibit', 'Add to Exhibit', 'Edit', 'Board', 'Exercise Requests', 'Esc', 'Log'];
  const model = { project: { name: 'x' }, requirements: names.map((t, i) => ({ id: `REQ-${String(i + 1).padStart(3, '0')}`, title: t })) };
  const r = evaluateGolden(model, golden);
  const hits = r.concepts.filter((c) => c.hit).map((c) => c.id);
  for (const id of ['void', 'restore', 'distribute', 'create-exhibit', 'add-to-exhibit-hidden', 'edit-keeps-board', 'exercise-requests-visibility', 'popup-close', 'audit-log']) {
    assert.ok(!hits.includes(id), `${id} matched a bare feature name`);
  }
});
