// Workspace resolution and file safety, including Windows path quirks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findWorkspace, samePath, Workspace } from '../src/workspace.js';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlock-ws-')));
const project = path.join(root, 'My Project');
fs.mkdirSync(path.join(project, '.sherlock', 'history'), { recursive: true });
fs.mkdirSync(path.join(project, 'docs', 'deep'), { recursive: true });
fs.writeFileSync(path.join(project, 'docs', 'prd.md'), '# x');
fs.writeFileSync(path.join(project, 'model.json'), '{}');
const WS = path.join(project, '.sherlock');

test('findWorkspace: from the .sherlock dir, a file inside it, the project, a sibling file', () => {
  assert.equal(findWorkspace(WS).dir, WS);
  assert.equal(findWorkspace(path.join(WS, 'model.draft.json')).dir, WS);
  assert.equal(findWorkspace(project).dir, WS);
  assert.equal(findWorkspace(path.join(project, 'model.json')).dir, WS);
});

test('findWorkspace: walks up from cwd', () => {
  const cwd = process.cwd();
  try {
    process.chdir(path.join(project, 'docs', 'deep'));
    assert.equal(findWorkspace().dir, WS);
  } finally {
    process.chdir(cwd);
  }
});

test('findWorkspace: missing workspace is a structured NOT_FOUND error', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlock-none-'));
  const cwd = process.cwd();
  try {
    process.chdir(empty);
    assert.throws(() => findWorkspace(), (e) => e.code === 'NO_WORKSPACE' && e.exit === 3);
  } finally {
    process.chdir(cwd);
  }
});

test('Windows paths: backslashes, forward slashes, drive-letter and folder casing', { skip: process.platform !== 'win32' }, () => {
  const fwd = WS.replace(/\\/g, '/');
  assert.equal(findWorkspace(fwd).dir, WS);
  assert.equal(findWorkspace(`${fwd}/model.draft.json`).dir, WS);
  const lower = WS.toLowerCase();
  assert.ok(samePath(findWorkspace(lower).dir, WS));
  assert.ok(samePath(lower, WS));
  assert.ok(samePath(WS.replace(/^([a-z]):/i, (d) => d.toLowerCase()), WS.replace(/^([a-z]):/i, (d) => d.toUpperCase())));
  assert.ok(samePath(`${WS}\\`, WS));
  assert.ok(!samePath(WS, `${WS}2`));
});

test('samePath is case-sensitive off Windows', { skip: process.platform === 'win32' }, () => {
  assert.ok(!samePath('/tmp/A', '/tmp/a'));
  assert.ok(samePath('/tmp/a/', '/tmp/a'));
});

test('write is atomic and leaves no temp files; mutate serializes read-modify-write', () => {
  const ws = new Workspace(WS);
  ws.write('feedback.json', []);
  for (let i = 0; i < 50; i++) ws.mutate('feedback.json', [], (l) => ({ value: [...l, i], result: null }));
  assert.equal(ws.feedback().length, 50);
  assert.deepEqual(fs.readdirSync(WS).filter((f) => /\.(tmp|lock)$/.test(f)), []);
  assert.throws(() => ws.mutate('feedback.json', [], () => { throw new Error('boom'); }), /boom/);
  assert.ok(!fs.existsSync(path.join(WS, 'feedback.json.lock')), 'lock released after a failure');
});

test('a stale lock from a crashed process is taken over', () => {
  const ws = new Workspace(WS);
  const lock = path.join(WS, 'feedback.json.lock');
  fs.writeFileSync(lock, '');
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lock, old, old);
  ws.mutate('feedback.json', [], (l) => ({ value: l, result: null }));
  assert.ok(!fs.existsSync(lock));
});
