// Local server: JSON API, feedback writes, static serving and SPA fallback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlock-srv-'));
const editor = path.join(tmp, 'out');
fs.mkdirSync(path.join(editor, '_next/static/chunks'), { recursive: true });
fs.writeFileSync(path.join(editor, 'index.html'), '<!doctype html><title>Sherlock</title>');
fs.writeFileSync(path.join(editor, '_next/static/chunks/app.js'), 'console.log(1)');
process.env.SHERLOCK_EDITOR_DIR = editor;

const { createServer } = await import('../src/server.js');
const { Workspace } = await import('../src/workspace.js');

const ws = new Workspace(path.join(tmp, 'project', '.sherlock')).init();
ws.write('model.json', {
  project: { name: 'Grants' },
  requirements: [{ id: 'REQ-001', title: 'Grant Price לא שלילי', classification: 'explicit' }],
});
ws.write('project.json', { name: 'Grants', revision: 3 });

let server;
let base;
before(async () => {
  server = createServer(ws.dir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
};

test('GET /api/health and /api/state', async () => {
  const h = await call('GET', '/api/health');
  assert.equal(h.json.ok, true);
  assert.equal(h.json.dir, ws.dir);
  const s = await call('GET', '/api/state');
  assert.equal(s.status, 200);
  assert.equal(s.headers.get('cache-control'), 'no-store');
  assert.equal(s.json.model.project.name, 'Grants');
  assert.equal(s.json.project.revision, 3);
  assert.equal(s.json.analysis.stats.counts.requirements, 1);
  assert.deepEqual(s.json.feedback, []);
});

test('POST /api/feedback creates FB ids, keeps Hebrew intact, rejects bad input', async () => {
  const a = await call('POST', '/api/feedback', { targetId: 'REQ-001', message: 'מאיפה זה הגיע?', type: 'question' });
  assert.equal(a.status, 201);
  assert.equal(a.json.id, 'FB-001');
  assert.equal(a.json.message, 'מאיפה זה הגיע?');
  assert.equal(a.json.targetTitle, 'Grant Price לא שלילי');
  assert.equal(a.json.revision, 3);
  const b = await call('POST', '/api/feedback', { message: 'General note' });
  assert.equal(b.json.id, 'FB-002');
  assert.equal(b.json.targetId, 'project');
  assert.equal(b.json.type, 'other');

  assert.equal((await call('POST', '/api/feedback', { targetId: 'NOPE-1', message: 'x' })).json.error, 'BAD_TARGET');
  assert.equal((await call('POST', '/api/feedback', { targetId: 'REQ-001', message: '  ' })).json.error, 'EMPTY_MESSAGE');
  const bad = await call('POST', '/api/feedback', 'not json');
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'BAD_JSON');
  assert.equal(ws.feedback().length, 2);
});

test('concurrent POSTs never lose feedback', async () => {
  const before = ws.feedback().length;
  await Promise.all(Array.from({ length: 25 }, (_, i) => call('POST', '/api/feedback', { targetId: 'REQ-001', message: `n${i}` })));
  const list = ws.feedback();
  assert.equal(list.length, before + 25);
  assert.equal(new Set(list.map((f) => f.id)).size, list.length);
});

test('PATCH /api/feedback/:id — reply, withdraw, reopen', async () => {
  const r1 = await call('PATCH', '/api/feedback/FB-001', { message: 'See §3.8' });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.thread.at(-1).author, 'qa');
  assert.equal(r1.json.status, 'open');
  const r2 = await call('PATCH', '/api/feedback/FB-001', { status: 'dismissed' });
  assert.equal(r2.json.status, 'dismissed');
  // A QA reply on a closed item reopens it; the author can't be spoofed.
  const r3 = await call('PATCH', '/api/feedback/FB-001', { message: 'Actually still wrong', author: 'claude' });
  assert.equal(r3.json.status, 'open');
  assert.equal(r3.json.thread.at(-1).author, 'qa');
  assert.equal(r3.json.resolution, undefined);
  assert.equal((await call('PATCH', '/api/feedback/FB-999', { status: 'open' })).status, 404);
});

test('static: assets, cache headers, SPA fallback, 404s, traversal', async () => {
  const idx = await call('GET', '/');
  assert.equal(idx.status, 200);
  assert.match(idx.headers.get('content-type'), /text\/html/);
  assert.equal(idx.headers.get('cache-control'), 'no-cache');
  const js = await call('GET', '/_next/static/chunks/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(js.headers.get('cache-control'), /immutable/);
  const deep = await call('GET', '/some/route');
  assert.equal(deep.status, 200);
  assert.match(deep.text, /<title>Sherlock/);
  assert.equal((await call('GET', '/_next/static/chunks/gone.js')).status, 404);
  assert.equal((await call('GET', '/missing.png')).status, 404);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok([403, 404].includes(trav.status), `traversal returned ${trav.status}`);
});

test('SSE pushes a change event when a workspace file changes', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const until = async (re) => {
    const t0 = Date.now();
    while (!re.test(buf) && Date.now() - t0 < 5000) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
    }
    return re.test(buf);
  };
  assert.ok(await until(/event: hello/));
  ws.write('model.json', { ...ws.model(), project: { name: 'Grants 2' } });
  assert.ok(await until(/event: change\ndata: .*model\.json/), buf);
  ctrl.abort();
});
