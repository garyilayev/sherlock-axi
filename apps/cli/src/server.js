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
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

class HttpError extends Error {
  constructor(status, code, message) { super(message ?? code); this.status = status; this.code = code; }
}

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
    req.setEncoding('utf8'); // decode across chunk boundaries (Hebrew is multi-byte)
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new HttpError(413, 'BODY_TOO_LARGE')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, 'BAD_JSON', 'request body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, { error: 'BAD_PATH' }); }
  const root = path.resolve(EDITOR_DIR);
  let file = path.resolve(root, `.${url}`);
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, { error: 'FORBIDDEN' });
  if (!isFile(file)) {
    if (isFile(path.join(file, 'index.html'))) file = path.join(file, 'index.html');
    else if (isFile(`${file}.html`)) file = `${file}.html`;
    // A missing asset is a 404. Serving index.html instead would make the
    // browser parse HTML as JS after a rebuild and fail with a cryptic error.
    else if (url.startsWith('/_next/') || path.extname(url)) return send(res, 404, { error: 'NOT_FOUND' });
    else file = path.join(root, 'index.html'); // SPA fallback (routing is hash-based anyway)
  }
  if (!isFile(file)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Sherlock editor is not built. Run: npm run build');
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    // Hashed build assets never change; HTML must revalidate so a rebuild is picked up.
    'cache-control': url.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache',
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

  let first = 0;
  const flush = () => {
    timer = null;
    broadcast('change', { files: [...pending] });
    pending = new Set();
  };
  const watcher = fs.watch(dir, (_, name) => {
    if (!name || /\.(tmp|lock|log)$/.test(name) || name === 'server.json' || name === 'state.json') return;
    if (!pending.size) first = Date.now();
    pending.add(name);
    clearTimeout(timer);
    // Debounce bursts (a CLI update writes several files), but never delay more than 500ms.
    timer = setTimeout(flush, Math.max(0, Math.min(120, first + 500 - Date.now())));
  });
  // Windows raises EPERM here when the workspace folder is deleted; don't crash.
  watcher.on('error', () => {});
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
        const revision = ws.project().revision ?? null;
        const fb = ws.mutate('feedback.json', [], (list) => {
          const created = newFeedback(list, { ...body, targetId: target, revision, model });
          return { value: [...list, created], result: created };
        });
        return send(res, 201, fb);
      }
      const m = pathname.match(/^\/api\/feedback\/(FB-\d+)$/);
      if (m && req.method === 'PATCH') {
        const body = await readBody(req);
        const fb = ws.mutate('feedback.json', [], (list) => {
          const idx = list.findIndex((f) => f.id === m[1]);
          if (idx < 0) return { value: list, result: null };
          const next = [...list];
          next[idx] = updateFeedback(list[idx], { status: body.status, message: body.message, author: 'qa' });
          return { value: next, result: next[idx] };
        });
        return fb ? send(res, 200, fb) : send(res, 404, { error: 'NOT_FOUND' });
      }
      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
      return serveStatic(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
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
