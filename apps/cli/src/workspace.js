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
    if (!fs.existsSync(file)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new AxiError('CORRUPT_JSON', `${name} is not valid JSON: ${e.message}`, {
        fields: { File: this.rel(file) }, exit: EXIT.INVALID,
      });
    }
  }

  write(name, data) {
    fs.mkdirSync(path.dirname(this.p(name)), { recursive: true });
    const tmp = this.p(`${name}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
    // Windows can briefly refuse the rename while a watcher/reader holds the file.
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, this.p(name)); break; } catch (e) {
        if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
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
