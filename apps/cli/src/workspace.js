// The local .sherlock/ workspace. All state lives here as plain JSON so both
// Claude and humans can read it, diff it and commit it.
//
// .sherlock/
// ├── project.json    name, revision, PRD reference, change log
// ├── prd.md          extracted PRD text with [§id] section anchors (Claude reads this)
// ├── prd.json        sectioned PRD (source view + provenance verification)
// ├── model.json      QA model — the source of truth
// ├── feedback.json   QA feedback threads
// ├── history/        previous model revisions
// └── server.json     running local server (pid, port, url)

import fs from 'node:fs';
import path from 'node:path';
import { AxiError, EXIT } from './axi.js';

export const DIRNAME = '.sherlock';

/** Path equality that respects Windows' case-insensitive file system. */
export function samePath(a, b) {
  const x = path.resolve(a), y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Windows briefly refuses reads/renames while another process (the server,
// an editor, antivirus, the indexer) holds the file open.
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
function retrying(fn, attempts = 80) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= attempts || !TRANSIENT.has(e.code)) throw e;
      sleepSync(25);
    }
  }
}

export function findWorkspace(hint, { mustExist = true } = {}) {
  let dir = null;
  if (hint) {
    const abs = path.resolve(hint);
    if (path.basename(abs) === DIRNAME) dir = abs;
    else if (path.basename(path.dirname(abs)) === DIRNAME) dir = path.dirname(abs);
    else if (fs.existsSync(path.join(abs, DIRNAME))) dir = path.join(abs, DIRNAME);
    else if (fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.existsSync(path.join(path.dirname(abs), DIRNAME))) {
      dir = path.join(path.dirname(abs), DIRNAME);
    }
  }
  if (!dir) {
    let cur = process.cwd();
    for (;;) {
      if (fs.existsSync(path.join(cur, DIRNAME))) { dir = path.join(cur, DIRNAME); break; }
      const up = path.dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  if (!dir && mustExist) {
    throw new AxiError('NO_WORKSPACE', 'No .sherlock workspace found in this directory or its parents.', {
      next: ['sherlock analyze <prd>   # creates .sherlock/ next to your PRD'],
      exit: EXIT.NOT_FOUND,
    });
  }
  return dir ? new Workspace(dir) : null;
}

export class Workspace {
  constructor(dir) {
    this.dir = dir;
    this.root = path.dirname(dir);
  }

  p(...parts) { return path.join(this.dir, ...parts); }

  /** Path relative to the user's project root, for compact output. */
  rel(file) { return path.relative(process.cwd(), file) || '.'; }

  exists(name) { return fs.existsSync(this.p(name)); }

  read(name, fallback = undefined) {
    const file = this.p(name);
    let raw;
    try {
      raw = retrying(() => fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return fallback;
      throw e;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new AxiError('CORRUPT_JSON', `${name} is not valid JSON: ${e.message}`, {
        fields: { File: this.rel(file) }, exit: EXIT.INVALID,
      });
    }
  }

  /** Atomic write: temp file + rename, so readers never see a half-written file. */
  write(name, data) {
    fs.mkdirSync(path.dirname(this.p(name)), { recursive: true });
    const tmp = this.p(`${name}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    fs.writeFileSync(tmp, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
    try {
      retrying(() => fs.renameSync(tmp, this.p(name)));
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  }

  /**
   * Read-modify-write under a lock file. The CLI (Claude) and the server (QA
   * in the browser) both change feedback.json; without the lock one side's
   * write can silently drop the other's.
   */
  mutate(name, fallback, fn) {
    const lock = this.p(`${name}.lock`);
    fs.mkdirSync(this.dir, { recursive: true });
    let fd = null;
    for (let i = 0; fd === null; i++) {
      try {
        fd = fs.openSync(lock, 'wx');
      } catch (e) {
        if (e.code !== 'EEXIST' && !TRANSIENT.has(e.code)) throw e;
        // A lock older than 10s belongs to a crashed process.
        try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.rmSync(lock, { force: true }); } catch {}
        if (i > 400) throw new AxiError('WORKSPACE_LOCKED', `${name} is locked by another process.`, { fields: { Lock: this.rel(lock) }, next: ['retry, or delete the .lock file if no Sherlock process is running'], exit: EXIT.SERVER });
        sleepSync(10);
      }
    }
    try {
      const out = fn(this.read(name, fallback));
      this.write(name, out.value);
      return out.result;
    } finally {
      fs.closeSync(fd);
      retrying(() => fs.rmSync(lock, { force: true }));
    }
  }

  init() { fs.mkdirSync(this.dir, { recursive: true }); return this; }

  project() { return this.read('project.json', {}); }
  prd() { return this.read('prd.json', null); }
  feedback() { return this.read('feedback.json', []); }

  model({ required = true } = {}) {
    const m = this.read('model.json', null);
    if (!m && required) {
      throw new AxiError('NO_MODEL', 'Workspace has no QA model yet.', {
        fields: { Workspace: this.rel(this.dir) },
        next: ['write the QA model JSON (see skill), then: sherlock create <model.json>'],
        exit: EXIT.NOT_FOUND,
      });
    }
    return m;
  }

  /** Persist a new model revision, archiving the previous one. */
  commitModel(model, change) {
    const project = this.project();
    const prev = this.model({ required: false });
    const revision = (project.revision ?? 0) + 1;
    if (prev) this.write(path.join('history', `model.r${String(project.revision ?? 0).padStart(4, '0')}.json`), prev);
    this.write('model.json', model);
    const entry = { revision, at: new Date().toISOString(), ...change };
    const changes = [entry, ...(project.changes || [])].slice(0, 30);
    this.write('project.json', {
      ...project,
      name: model.project?.name ?? project.name,
      revision,
      updatedAt: entry.at,
      lastChange: entry,
      changes,
    });
    return revision;
  }
}
