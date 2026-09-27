// Sherlock local server: serves the static editor and a tiny JSON API over the
// .sherlock workspace, and pushes live-reload events when files change.
//
//   node server.js --dir <path/to/.sherlock> --port <n>
//
// GET   /api/health          liveness + which workspace this server owns
// GET   /api/state           project, model, analysis, feedback, PRD outline
// GET   /api/prd             full sectioned PRD (source view)
// POST  /api/feedback        { targetId, message, type }
// PATCH /api/feedback/:id    { status?, message? }   (reopen / reply / dismiss)
// GET   /api/events          SSE: "change" events { files: [...] }

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeModel, kindOfId } from '@sherlock/qa-model';
import { Workspace } from './workspace.js';
import { newFeedback, updateFeedback } from './feedback.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EDITOR_DIR = process.env.SHERLOCK_EDITOR_DIR || path.resolve(here, '../../editor/out');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

export function buildState(ws) {
  const model = ws.model({ required: false });
  const feedback = ws.feedback();
  const prd = ws.prd();
  return {
    project: ws.project(),
    model,
    feedback,
    analysis: model ? analyzeModel(model, { prd, feedback }) : null,
    prd: prd && {
      document: prd.document, format: prd.format, title: prd.title, words: prd.words,
      sections: prd.sections.map(({ text, ...s }) => s),
    },
    workspace: ws.dir,
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(EDITOR_DIR, url);
  if (!file.startsWith(EDITOR_DIR)) return send(res, 403, { error: 'FORBIDDEN' });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
  if (!fs.existsSync(file)) file = path.join(EDITOR_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('Sherlock editor is not built. Run: npm run build');
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': file.includes(`${path.sep}_next${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

export function createServer(dir) {
  const ws = new Workspace(dir);
  const clients = new Set();
  let pending = new Set();
  let timer = null;

  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };

  const watcher = fs.watch(dir, (_, name) => {
    if (!name || name.endsWith('.tmp') || name === 'server.json' || name === 'state.json') return;
    pending.add(name);
    clearTimeout(timer);
    timer = setTimeout(() => {
      broadcast('change', { files: [...pending] });
      pending = new Set();
    }, 120);
  });
  const heartbeat = setInterval(() => broadcast('ping', { t: Date.now() }), 25_000);

  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    try {
      if (pathname === '/api/health') return send(res, 200, { ok: true, dir, pid: process.pid });
      if (pathname === '/api/state') return send(res, 200, buildState(ws));
      if (pathname === '/api/prd') return send(res, 200, ws.prd());
      if (pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: hello\ndata: ${JSON.stringify({ pid: process.pid })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (pathname === '/api/feedback' && req.method === 'POST') {
        const body = await readBody(req);
        const model = ws.model({ required: false });
        const target = body.targetId || 'project';
        if (target !== 'project' && !kindOfId(target)) return send(res, 400, { error: 'BAD_TARGET' });
        if (!String(body.message || '').trim()) return send(res, 400, { error: 'EMPTY_MESSAGE' });
        const list = ws.feedback();
        const fb = newFeedback(list, { ...body, targetId: target, revision: ws.project().revision ?? null, model });
        ws.write('feedback.json', [...list, fb]);
        return send(res, 201, fb);
      }
      const m = pathname.match(/^\/api\/feedback\/(FB-\d+)$/);
      if (m && req.method === 'PATCH') {
        const body = await readBody(req);
        const list = ws.feedback();
        const idx = list.findIndex((f) => f.id === m[1]);
        if (idx < 0) return send(res, 404, { error: 'NOT_FOUND' });
        list[idx] = updateFeedback(list[idx], { ...body, author: 'qa' });
        ws.write('feedback.json', list);
        return send(res, 200, list[idx]);
      }
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
      return serveStatic(req, res);
    } catch (e) {
      return send(res, 500, { error: 'INTERNAL', message: e.message });
    }
  });
  server.on('close', () => { watcher.close(); clearInterval(heartbeat); });
  return server;
}

// Run as a detached process (spawned by `sherlock open`).
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(fileURLToPath(import.meta.url), path.resolve(process.argv[1]))) {
  const args = process.argv.slice(2);
  const dir = args[args.indexOf('--dir') + 1];
  const port = Number(args[args.indexOf('--port') + 1]);
  const server = createServer(dir);
  server.listen(port, '127.0.0.1', () => {
    fs.writeFileSync(path.join(dir, 'server.json'), JSON.stringify({
      pid: process.pid, port, url: `http://localhost:${port}`, startedAt: new Date().toISOString(),
    }, null, 2));
  });
  const shutdown = () => {
    try {
      const info = JSON.parse(fs.readFileSync(path.join(dir, 'server.json'), 'utf8'));
      if (info.pid === process.pid) fs.unlinkSync(path.join(dir, 'server.json'));
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  // Exit if the workspace disappears.
  setInterval(() => { if (!fs.existsSync(dir)) shutdown(); }, 10_000).unref();
}
