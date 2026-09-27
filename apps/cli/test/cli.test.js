// CLI integration: analyze → create → feedback → update (patch + resolve) → validate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/sherlock.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlock-'));
const run = (...args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, SHERLOCK_NO_BROWSER: '1' } });
  return { code: r.status, out: r.stdout, json: args.includes('--json') ? JSON.parse(r.stdout) : null };
};
const write = (name, data) => fs.writeFileSync(path.join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));

write('prd.md', `# Grants PRD\n\n## 3.8 Grant Price\n\nGrant Price must be a non-negative decimal. It can be 0.\n\n## 5.4 Void\n\nVoided grants are hidden unless Show Voided is on. A voided grant can be restored.\n`);
const model = {
  project: { name: 'Grants' },
  requirements: [
    { id: 'REQ-001', title: 'Grant Price non-negative', classification: 'explicit', source: { section: '3.8', excerpt: 'Grant Price must be a non-negative decimal' } },
    { id: 'REQ-002', title: 'Void hides grants', classification: 'explicit', source: { section: '5.4', excerpt: 'hidden unless Show Voided is on' } },
  ],
  testCases: [
    { id: 'TC-001', title: 'Reject -5', type: 'negative', classification: 'derived', requirementIds: ['REQ-001'], steps: ['enter -5'], expectedResult: 'blocked', source: { requirementId: 'REQ-001' } },
  ],
};

test('errors are structured with exit codes', () => {
  const r = run('analyze', 'missing.docx');
  assert.equal(r.code, 3);
  assert.match(r.out, /^ERROR PRD_NOT_FOUND/);
  assert.match(run('inspect').out, /ERROR NO_WORKSPACE/);
});

test('analyze → create → inspect', () => {
  assert.equal(run('analyze', 'prd.md').code, 0);
  assert.ok(fs.existsSync(path.join(dir, '.sherlock/prd.md')));
  write('bad.json', { ...model, testCases: [{ ...model.testCases[0], requirementIds: ['REQ-404'] }] });
  const bad = run('create', 'bad.json');
  assert.equal(bad.code, 2);
  assert.match(bad.out, /DANGLING_REF/);
  write('model.json', model);
  assert.equal(run('create', 'model.json').code, 0);
  const i = run('inspect', '--json').json;
  assert.equal(i.coverage.covered, 1);
  assert.equal(i.coverage.uncovered, 1);
  assert.equal(i.traceability, 100);
});

test('feedback → update with patch and --resolve', () => {
  write('.sherlock/feedback.json', [{ id: 'FB-001', targetId: 'REQ-002', type: 'missing', message: 'Add a test', status: 'open', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', thread: [] }]);
  assert.match(run('feedback').out, /OPEN FEEDBACK: 1/);
  write('patch.json', { upsert: [{ id: 'TC-002', title: 'Voided hidden', type: 'happy-path', classification: 'derived', requirementIds: ['REQ-002'], steps: ['void'], expectedResult: 'hidden', source: { requirementId: 'REQ-002' } }] });
  const u = run('update', 'patch.json', '--resolve', 'FB-001', '--note', 'Added TC-002', '--json').json;
  assert.equal(u.revision, 2);
  assert.deepEqual(u.added, ['TC-002']);
  const fb = JSON.parse(fs.readFileSync(path.join(dir, '.sherlock/feedback.json'), 'utf8'))[0];
  assert.equal(fb.status, 'resolved');
  assert.equal(fb.thread.at(-1).author, 'claude');
  assert.ok(fs.existsSync(path.join(dir, '.sherlock/history/model.r0001.json')));
  assert.equal(run('inspect', '--json').json.coverage.covered, 2);
});

test('validate accepts a directory of model parts, merged in name order', () => {
  fs.mkdirSync(path.join(dir, 'parts'), { recursive: true });
  write('parts/00-project.json', { project: { name: 'Grants' } });
  write('parts/01-reqs.json', { requirements: [model.requirements[0]] });
  write('parts/02-reqs.json', { requirements: [model.requirements[1]] });
  write('parts/03-tests.json', { testCases: model.testCases });
  const v = run('validate', 'parts', '--json').json;
  assert.equal(v.ok, true);
  assert.equal(v.errors.length, 0);
  write('parts/04-broken.json', '{ "gaps": [ ');
  const bad = run('validate', 'parts');
  assert.equal(bad.code, 2);
  assert.match(bad.out, /INVALID_JSON[\s\S]*04-broken\.json/);
});

test('unverifiable quotes are flagged', () => {
  write('patch2.json', { merge: [{ id: 'REQ-002', source: { section: '5.4', excerpt: 'grants are deleted forever' } }] });
  const v = run('validate', 'patch2.json');
  assert.match(v.out, /SOURCE_EXCERPT_NOT_FOUND/);
});
