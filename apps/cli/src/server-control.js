// Start / find / stop the per-workspace local server.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AxiError, EXIT } from './axi.js';
import { EDITOR_DIR } from './server.js';

const SERVER_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js');
export const DEFAULT_PORT = 4870;

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

async function health(url, dir) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(800) });
    const body = await res.json();
    return body.ok && path.resolve(body.dir) === path.resolve(dir);
  } catch {
    return false;
  }
}

export async function runningServer(ws) {
  const info = ws.read('server.json', null);
  if (!info || !alive(info.pid)) return null;
  return (await health(info.url, ws.dir)) ? info : null;
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

export async function ensureServer(ws, { port } = {}) {
  const existing = await runningServer(ws);
  if (existing) return { ...existing, reused: true };

  if (!fs.existsSync(path.join(EDITOR_DIR, 'index.html'))) {
    throw new AxiError('EDITOR_NOT_BUILT', 'The Sherlock editor has not been built yet.', {
      fields: { Expected: EDITOR_DIR },
      next: [`npm run build   # in ${path.resolve(EDITOR_DIR, '../../..')}`],
      exit: EXIT.SERVER,
    });
  }

  let p = Number(port) || DEFAULT_PORT;
  const limit = p + 40;
  while (p < limit && !(await portFree(p))) p++;
  if (p >= limit) throw new AxiError('NO_FREE_PORT', `No free port in ${port || DEFAULT_PORT}–${limit}.`, { exit: EXIT.SERVER, next: ['sherlock open --port <n>'] });

  const log = fs.openSync(ws.p('server.log'), 'a');
  const child = spawn(process.execPath, [SERVER_JS, '--dir', ws.dir, '--port', String(p)], {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();

  const url = `http://localhost:${p}`;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await health(url, ws.dir)) return { pid: child.pid, port: p, url, reused: false };
  }
  throw new AxiError('SERVER_START_FAILED', 'Local server did not become healthy within 5s.', {
    fields: { Log: ws.rel(ws.p('server.log')) },
    next: [`inspect ${ws.rel(ws.p('server.log'))}`],
    exit: EXIT.SERVER,
  });
}

export async function stopServer(ws) {
  const info = ws.read('server.json', null);
  if (!info || !alive(info.pid)) {
    if (info) fs.rmSync(ws.p('server.json'), { force: true });
    return false;
  }
  process.kill(info.pid, 'SIGTERM');
  for (let i = 0; i < 20 && alive(info.pid); i++) await new Promise((r) => setTimeout(r, 100));
  fs.rmSync(ws.p('server.json'), { force: true });
  return true;
}

/** Best-effort browser launch. Returns false when it can't (headless, CI). */
export function openBrowser(url) {
  if (process.env.SHERLOCK_NO_BROWSER || process.env.CI) return Promise.resolve(false);
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
        : ['xdg-open', [url]];
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const c = execFile(cmd, args, { windowsHide: true }, (err) => resolve(!err));
      c.on('error', () => resolve(false));
      setTimeout(() => resolve(true), 1500);
    } catch {
      resolve(false);
    }
  });
}
