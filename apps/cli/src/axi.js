// AXI — Agent eXperience Interface helpers.
// Output is compact, predictable and ends with NEXT suggestions. Every
// command also supports --json for exact structured output.

export const EXIT = { OK: 0, USAGE: 1, INVALID: 2, NOT_FOUND: 3, SERVER: 4, EXTRACT: 5 };

export class AxiError extends Error {
  constructor(code, message, { fields = {}, next = [], exit = EXIT.USAGE, details = [] } = {}) {
    super(message);
    this.code = code;
    this.fields = fields;
    this.next = next;
    this.exit = exit;
    this.details = details;
  }
}

let jsonMode = false;
export const setJsonMode = (v) => { jsonMode = !!v; };
export const isJsonMode = () => jsonMode;

const pad = (s, n) => String(s).padEnd(n);

export function truncate(text, n = 110) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Print a result block.
 * @param {object} r
 * @param {string} r.title       e.g. "SHERLOCK READY"
 * @param {Array<[string, any]>} [r.fields]   KEY: value lines
 * @param {Array<{title: string, lines: string[]}>} [r.sections]
 * @param {string[]} [r.next]
 * @param {object} [r.data]      structured payload for --json
 */
export function emit({ title, fields = [], sections = [], next = [], data }) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({ ok: true, status: title, ...(data ?? Object.fromEntries(fields)), next }, null, 2)}\n`);
    return;
  }
  const out = [title];
  const shown = fields.filter(([, v]) => v !== undefined && v !== null && v !== '');
  const w = Math.max(0, ...shown.map(([k]) => k.length)) + 2;
  if (shown.length) out.push(...shown.map(([k, v]) => `${pad(`${k}:`, w)}${v}`));
  for (const s of sections) {
    if (!s?.lines?.length) continue;
    out.push('', `${s.title}:`, ...s.lines.map((l) => (l === '' ? '' : `  ${l}`)));
  }
  if (next.length) out.push('', 'NEXT:', ...next.map((n) => `  ${n}`));
  process.stdout.write(`${out.join('\n')}\n`);
}

export function emitError(e) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: e.code, message: e.message, ...e.fields, details: e.details, next: e.next }, null, 2)}\n`);
    return;
  }
  const out = [`ERROR ${e.code}`];
  const f = Object.entries(e.fields).filter(([, v]) => v != null);
  if (f.length) out.push('', ...f.map(([k, v]) => `${k}: ${v}`));
  out.push('', e.message);
  if (e.details.length) {
    const shown = e.details.slice(0, 25);
    out.push('', ...shown.map((d) => `  ${d}`));
    if (e.details.length > shown.length) out.push(`  … +${e.details.length - shown.length} more (use --json for all)`);
  }
  if (e.next.length) out.push('', 'NEXT:', ...e.next.map((n) => `  ${n}`));
  process.stdout.write(`${out.join('\n')}\n`);
}

/** Format validation issues one per line: "CODE  ID  message". */
export function issueLines(issues, limit = 15) {
  const lines = issues.slice(0, limit).map((i) => `${pad(i.code, 24)}${pad(i.id ?? '-', 11)}${i.message}`);
  if (issues.length > limit) lines.push(`… +${issues.length - limit} more`);
  return lines;
}

/** Group warnings by code: "REQ_UNCOVERED ×3 (REQ-004, REQ-009, …)". */
export function summarizeIssues(issues, limit = 8) {
  const groups = new Map();
  for (const i of issues) {
    if (!groups.has(i.code)) groups.set(i.code, []);
    groups.get(i.code).push(i.id);
  }
  return [...groups.entries()].slice(0, limit).map(([code, ids]) => {
    const list = ids.filter(Boolean);
    const sample = list.slice(0, 4).join(', ') + (list.length > 4 ? ', …' : '');
    return `${pad(code, 24)}×${ids.length}${sample ? `  (${sample})` : ''}`;
  });
}

export function parseArgs(argv, booleans = []) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) flags[k] = v;
      else if (booleans.includes(k) || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) flags[k] = true;
      else flags[k] = argv[++i];
    } else if (a === '-h') flags.help = true;
    else positional.push(a);
  }
  return { positional, flags };
}
