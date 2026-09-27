import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  KINDS, KIND_KEYS, kindOfId, entities, titleOf, validateModel, analyzeModel,
  isPatch, applyPatch, diffModels, resolveSection, evaluateGolden,
} from '@sherlock/qa-model';
import { AxiError, EXIT, emit, issueLines, summarizeIssues, truncate } from './axi.js';
import { Workspace, findWorkspace, DIRNAME } from './workspace.js';
import { extractPrd, renderPrdMarkdown, SUPPORTED } from './prd/extract.js';
import { ensureServer, runningServer, stopServer, openBrowser } from './server-control.js';
import { updateFeedback } from './feedback.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BIN = path.join(REPO_ROOT, 'apps/cli/bin/sherlock.js');

// ---------------------------------------------------------------- helpers

function readJsonFile(file) {
  if (file === '-') return JSON.parse(fs.readFileSync(0, 'utf8'));
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new AxiError('FILE_NOT_FOUND', 'The specified file does not exist.', {
      fields: { File: file }, next: ['verify the file path'], exit: EXIT.NOT_FOUND,
    });
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new AxiError('INVALID_JSON', e.message, { fields: { File: file }, next: ['fix the JSON syntax and retry'], exit: EXIT.INVALID });
  }
}

function assertValid(result, file) {
  if (result.ok) return;
  throw new AxiError('MODEL_INVALID', `${result.errors.length} error(s) — nothing was written.`, {
    fields: { File: file },
    details: issueLines(result.errors, 40),
    next: ['fix the errors above, then rerun the same command', `sherlock validate ${file}   # dry run`],
    exit: EXIT.INVALID,
  });
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');

/** Compact state summary shared by inspect / create / update. */
function summary(ws, model, analysis) {
  const c = analysis.stats.counts;
  const cov = analysis.coverage.summary;
  const fields = [['PROJECT', model.project?.name], ['REVISION', ws.project().revision ?? 0]];
  for (const k of KIND_KEYS) if (c[k]) fields.push([KINDS[k].label.toUpperCase().replace(/ /g, '_'), c[k]]);
  fields.push(
    ['COVERAGE', `${cov.covered}/${cov.total} covered, ${cov.partial} partial, ${cov.uncovered} uncovered, ${cov.ambiguous} ambiguous`],
    ['TRACEABILITY', `${analysis.provenance.traceability}% (${analysis.provenance.verified}/${analysis.provenance.total} excerpts verified in PRD)`],
    ['OPEN_GAPS', analysis.openGaps],
    ['OPEN_FEEDBACK', analysis.openFeedback],
    ['REVIEW_STATUS', analysis.reviewStatus],
  );
  return fields;
}

function load(ws) {
  const model = ws.model();
  const prd = ws.prd();
  const feedback = ws.feedback();
  return { model, prd, feedback, analysis: analyzeModel(model, { prd, feedback }) };
}

function findEntity(model, id) {
  for (const [kind, e] of entities(model)) if (e.id === id) return { kind, e };
  return null;
}

function setCursor(ws, feedback) {
  const latest = feedback.reduce((m, f) => (f.updatedAt > m ? f.updatedAt : m), '');
  const state = ws.read('state.json', {});
  if (latest && latest > (state.feedbackCursor ?? '')) ws.write('state.json', { ...state, feedbackCursor: latest });
}

function feedbackLines(list, model) {
  const lines = [];
  for (const f of list) {
    const t = model && f.targetId !== 'project' ? findEntity(model, f.targetId) : null;
    const title = t ? titleOf(t.e) : f.targetTitle;
    const missing = f.targetId !== 'project' && model && !t ? ' [target no longer exists]' : '';
    lines.push(`${f.id}  ${f.status.toUpperCase()}  ${f.type}  → ${f.targetId}${title ? ` "${truncate(title, 60)}"` : ''}${missing}`);
    lines.push(`  "${truncate(f.message, 300)}"`);
    for (const r of (f.thread || []).slice(-3)) lines.push(`  ${r.author}: "${truncate(r.message, 200)}"`);
    lines.push('');
  }
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

// ---------------------------------------------------------------- analyze

export async function analyze({ positional: [file], flags }) {
  if (!file) throw new AxiError('USAGE', 'Missing PRD path.', { next: ['sherlock analyze <prd.docx|prd.pdf|prd.md>'] });
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new AxiError('PRD_NOT_FOUND', 'The specified PRD does not exist.', {
      fields: { File: file }, next: ['verify the file path'], exit: EXIT.NOT_FOUND,
    });
  }
  const ext = path.extname(abs).toLowerCase();
  if (!SUPPORTED.includes(ext)) {
    throw new AxiError('UNSUPPORTED_FORMAT', `Supported: ${SUPPORTED.join(', ')}`, {
      fields: { File: file }, next: ['convert the PRD to .docx, .pdf or .md'],
    });
  }
  let prd;
  try {
    prd = await extractPrd(abs);
  } catch (e) {
    throw new AxiError('EXTRACT_FAILED', e.message, { fields: { File: file }, exit: EXIT.EXTRACT, next: ['export the PRD as .md or .pdf and retry'] });
  }
  if (!prd.sections.length || prd.words < 20) {
    throw new AxiError('PRD_EMPTY', 'No readable text found (scanned PDF?).', { fields: { File: file }, exit: EXIT.EXTRACT, next: ['provide a text-based PDF, .docx or .md'] });
  }

  const ws = new Workspace(path.resolve(flags.dir ?? '.', DIRNAME)).init();
  const md = renderPrdMarkdown(prd);
  const sha = crypto.createHash('sha1').update(md.replace(/^<!--.*-->\n/, '')).digest('hex').slice(0, 12);
  const project = ws.project();
  const changed = project.prd?.sha && project.prd.sha !== sha;
  ws.write('prd.json', prd);
  ws.write('prd.md', md);
  ws.write('project.json', {
    ...project,
    name: project.name ?? prd.title ?? path.basename(abs, ext),
    revision: project.revision ?? 0,
    createdAt: project.createdAt ?? new Date().toISOString(),
    prd: { document: prd.document, path: abs, format: prd.format, sha, sections: prd.sections.length, words: prd.words },
  });

  const outline = prd.sections
    .filter((s) => s.level <= 2 && s.number)
    .slice(0, 70)
    .map((s) => `${'  '.repeat(s.level - 1)}§${s.id}  ${truncate(s.heading, 70)}`);
  const unnumbered = prd.sections.filter((s) => !s.number).length;

  const hasModel = ws.exists('model.json');
  emit({
    title: changed ? 'PRD RE-EXTRACTED (CHANGED)' : 'PRD EXTRACTED',
    fields: [
      ['DOCUMENT', prd.document],
      ['FORMAT', prd.format],
      ['SECTIONS', `${prd.sections.length}${unnumbered ? ` (${unnumbered} sub-sections as <parent>/<n>)` : ''}`],
      ['WORDS', prd.words],
      ['TEXT', ws.rel(ws.p('prd.md'))],
      ['WORKSPACE', ws.rel(ws.dir)],
    ],
    sections: [{ title: 'OUTLINE', lines: outline }],
    next: hasModel
      ? ['sherlock validate .sherlock/model.json   # re-verify sources against the changed PRD', 'sherlock open']
      : [
        `read ${ws.rel(ws.p('prd.md'))} in full (cite sections as [§id], quote excerpts verbatim)`,
        'write the QA model to .sherlock/model.draft.json',
        'sherlock create .sherlock/model.draft.json',
      ],
    data: { document: prd.document, format: prd.format, sections: prd.sections.length, words: prd.words, text: ws.p('prd.md'), workspace: ws.dir, changed: !!changed, outline: prd.sections.map(({ text, ...s }) => s) },
  });
}

// ---------------------------------------------------------------- create / update / validate

export async function create({ positional: [file], flags }) {
  if (!file) throw new AxiError('USAGE', 'Missing model path.', { next: ['sherlock create <model.json>'] });
  const ws = findWorkspace(flags.dir ?? file);
  const model = readJsonFile(file);
  if (ws.exists('model.json') && !flags.force) {
    throw new AxiError('MODEL_EXISTS', 'Workspace already has a QA model.', {
      fields: { Workspace: ws.rel(ws.dir) },
      next: [`sherlock update ${file}   # replace, keeping history`, `sherlock create ${file} --force`],
    });
  }
  const prd = ws.prd();
  model.schemaVersion ??= 1;
  model.project ??= {};
  if (prd && !model.project.prd) model.project.prd = { document: prd.document };
  const result = validateModel(model, { prd });
  assertValid(result, file);
  const ids = [...entities(model)].map(([, e]) => e.id);
  ws.commitModel(model, { type: 'create', added: ids, modified: [], removed: [], note: flags.note ?? null });
  const { analysis } = load(ws);
  const server = await runningServer(ws);
  emit({
    title: 'QA MODEL CREATED',
    fields: [...summary(ws, model, analysis), ['MODEL', ws.rel(ws.p('model.json'))]],
    sections: [{ title: `WARNINGS (${result.warnings.length})`, lines: summarizeIssues(result.warnings) }],
    next: [
      server ? `browser at ${server.url} refreshed automatically` : 'sherlock open',
      ...(result.warnings.length ? ['sherlock validate .sherlock/model.json   # full warning list'] : []),
    ],
    data: { revision: ws.project().revision, stats: analysis.stats, coverage: analysis.coverage.summary, warnings: result.warnings },
  });
}

export async function update({ positional: [file], flags }) {
  if (!file) throw new AxiError('USAGE', 'Missing model or patch path.', { next: ['sherlock update <model.json|patch.json|->'] });
  const ws = findWorkspace(flags.dir);
  const prev = ws.model();
  const doc = readJsonFile(file);
  let next;
  if (isPatch(doc)) {
    const r = applyPatch(prev, doc);
    if (r.problems.length) {
      throw new AxiError('PATCH_FAILED', `${r.problems.length} patch operation(s) failed — nothing was written.`, {
        fields: { File: file }, details: issueLines(r.problems), exit: EXIT.INVALID,
        next: ['sherlock show <ID>   # check the current entity', 'fix the patch and retry'],
      });
    }
    next = r.model;
  } else {
    next = doc;
  }
  const prd = ws.prd();
  const result = validateModel(next, { prd });
  assertValid(result, file);
  const diff = diffModels(prev, next);
  const changedIds = [...diff.added, ...diff.modified, ...diff.removed];
  const resolveIds = flags.resolve ? String(flags.resolve).split(',').map((s) => s.trim()).filter(Boolean) : [];

  if (!changedIds.length && !diff.projectChanged && !resolveIds.length) {
    emit({ title: 'NO CHANGES', fields: [['REVISION', ws.project().revision]], next: [] });
    return;
  }
  let revision = ws.project().revision;
  if (changedIds.length || diff.projectChanged) {
    revision = ws.commitModel(next, { type: isPatch(doc) ? 'patch' : 'replace', ...diff, note: flags.note ?? null, resolves: resolveIds });
  }
  const resolved = resolveIds.length ? resolveFeedback(ws, resolveIds, { note: flags.note, changedIds, revision }) : [];

  const { analysis } = load(ws);
  const server = await runningServer(ws);
  const list = (ids) => (ids.length ? `${ids.length}  ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ', …' : ''}` : undefined);
  emit({
    title: `QA MODEL UPDATED — REV ${revision}`,
    fields: [
      ['ADDED', list(diff.added)],
      ['MODIFIED', list(diff.modified)],
      ['REMOVED', list(diff.removed)],
      ['RESOLVED', resolved.length ? resolved.join(', ') : undefined],
      ['OPEN_FEEDBACK', analysis.openFeedback],
      ['COVERAGE', `${analysis.coverage.summary.covered}/${analysis.coverage.summary.total} covered`],
      ['TRACEABILITY', `${analysis.provenance.traceability}%`],
      ['WARNINGS', result.warnings.length],
    ],
    sections: [{ title: 'WARNINGS', lines: summarizeIssues(result.warnings, 6) }],
    next: [
      server ? `browser at ${server.url} refreshed automatically` : 'sherlock open',
      ...(analysis.openFeedback ? ['sherlock feedback   # remaining open items'] : ['sherlock poll   # wait for more QA feedback']),
    ],
    data: { revision, ...diff, resolved, openFeedback: analysis.openFeedback, warnings: result.warnings },
  });
}

export async function validate({ positional: [file], flags }) {
  const ws = findWorkspace(flags.dir ?? file, { mustExist: false });
  const target = file ?? ws?.p('model.json');
  if (!target) throw new AxiError('USAGE', 'Missing model path.', { next: ['sherlock validate <model.json>'] });
  let model = readJsonFile(target);
  if (isPatch(model)) model = applyPatch(ws.model(), model).model;
  const result = validateModel(model, { prd: ws?.prd() ?? null });
  emit({
    title: result.ok ? 'VALID' : 'INVALID',
    fields: [['ERRORS', result.errors.length], ['WARNINGS', result.warnings.length], ['PRD', ws?.prd() ? 'sources verified against prd.json' : 'no PRD — sources not verified']],
    sections: [
      { title: 'ERRORS', lines: issueLines(result.errors, 60) },
      { title: 'WARNINGS', lines: issueLines(result.warnings, flags.all ? 1e6 : 40) },
    ],
    next: result.ok ? [] : ['fix errors, then rerun'],
    data: result,
  });
  if (!result.ok) process.exitCode = EXIT.INVALID;
}

// ---------------------------------------------------------------- open / stop

export async function open({ positional: [hint], flags }) {
  const ws = findWorkspace(flags.dir ?? hint);
  const model = ws.model();
  const server = await ensureServer(ws, { port: flags.port });
  let url = server.url;
  if (flags.focus) {
    const kind = kindOfId(flags.focus);
    url += kind ? `/#/${kind}/${flags.focus}` : flags.focus === 'feedback' ? '/#/feedback' : '';
  }
  const browser = flags['no-browser'] ? false : await openBrowser(url);
  emit({
    title: 'SHERLOCK READY',
    fields: [
      ['PROJECT', model.project?.name],
      ['REVISION', ws.project().revision],
      ['URL', url],
      ['SERVER', server.reused ? `already running (pid ${server.pid})` : `started (pid ${server.pid})`],
      ['BROWSER', browser ? 'opened' : 'not opened — share the URL with the user'],
    ],
    next: [
      'tell the user to review in the browser and leave feedback on any item',
      'sherlock poll   # blocks until QA feedback arrives',
    ],
    data: { url, pid: server.pid, port: server.port, reused: server.reused, browser },
  });
}

export async function stop({ flags }) {
  const ws = findWorkspace(flags.dir);
  const stopped = await stopServer(ws);
  emit({ title: stopped ? 'SERVER STOPPED' : 'SERVER NOT RUNNING', fields: [], next: stopped ? [] : ['sherlock open'] });
}

// ---------------------------------------------------------------- inspect / show

export async function inspect({ positional: [hint], flags }) {
  const ws = findWorkspace(flags.dir ?? hint);
  const { model, analysis } = load(ws);
  const server = await runningServer(ws);
  const cov = analysis.coverage;
  const problemReqs = Object.entries(cov.perRequirement)
    .filter(([, c]) => c.status !== 'covered')
    .slice(0, 12)
    .map(([id, c]) => `${id}  ${c.status}${c.untestedChecks.length ? `  untested: ${c.untestedChecks.join(', ')}` : ''}`);
  const src = analysis.provenance.issues.slice(0, 10).map((i) => `${i.id}  ${i.status}${i.foundIn ? ` → found in §${i.foundIn}` : ''}`);
  emit({
    title: 'SHERLOCK WORKSPACE',
    fields: [...summary(ws, model, analysis), ['URL', server?.url ?? 'not running']],
    sections: [
      { title: 'COVERAGE GAPS', lines: problemReqs },
      { title: `SOURCE ISSUES (${analysis.provenance.issues.length})`, lines: src },
    ],
    next: [
      ...(server ? [] : ['sherlock open']),
      ...(analysis.openFeedback ? ['sherlock feedback'] : []),
      ...(problemReqs.length ? ['sherlock show <REQ-ID>   # see linked tests and checks'] : []),
    ],
    data: { project: model.project?.name, revision: ws.project().revision, stats: analysis.stats, coverage: cov.summary, traceability: analysis.provenance.traceability, sourceIssues: analysis.provenance.issues, openGaps: analysis.openGaps, openFeedback: analysis.openFeedback, reviewStatus: analysis.reviewStatus, url: server?.url ?? null },
  });
}

const SHOW_SKIP = new Set(['id', 'title', 'question', 'classification', 'source', 'relationships', 'description', 'type', 'priority']);

function fieldLines(key, value) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return [];
  const label = key.replace(/([A-Z])/g, '_$1').toUpperCase();
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) {
      if (key === 'steps' || key === 'preconditions') return [`${label}:`, ...value.map((v, i) => `  ${i + 1}. ${truncate(v, 200)}`)];
      return [`${label}: ${value.join(', ')}`];
    }
    return [`${label}:`, ...value.map((v, i) => `  ${i + 1}. ${truncate(typeof v === 'object' ? Object.values(v).filter((x) => typeof x !== 'object').join(' · ') : v, 200)}`)];
  }
  if (typeof value === 'object') return [`${label}: ${truncate(JSON.stringify(value), 200)}`];
  return [`${label}: ${truncate(value, 400)}`];
}

export async function show({ positional: ids, flags }) {
  if (!ids.length) throw new AxiError('USAGE', 'Missing ID.', { next: ['sherlock show REQ-001 [TC-004 …]'] });
  const ws = findWorkspace(flags.dir);
  const { model, prd, feedback, analysis } = load(ws);
  const blocks = [];
  const data = [];
  for (const id of ids) {
    const hit = findEntity(model, id);
    if (!hit) {
      throw new AxiError('ENTITY_NOT_FOUND', `${id} does not exist in the model.`, { next: ['sherlock inspect'], exit: EXIT.NOT_FOUND });
    }
    const { kind, e } = hit;
    const v = analysis.provenance.perEntity[id];
    const sec = e.source?.section ? resolveSection(prd, e.source.section) : null;
    const l = analysis.links[id] || { out: [], in: [] };
    const lines = [
      `${id}  ${titleOf(e)}`,
      `KIND: ${KINDS[kind].singular}   CLASS: ${e.classification ?? '–'}${e.type ? `   TYPE: ${e.type}` : ''}${e.priority ? `   PRIORITY: ${e.priority}` : ''}`,
    ];
    if (e.description) lines.push(`DESCRIPTION: ${truncate(e.description, 400)}`);
    if (e.question && e.title) lines.push(`QUESTION: ${e.question}`);
    for (const [k, val] of Object.entries(e)) if (!SHOW_SKIP.has(k) && !/Ids?$/.test(k)) lines.push(...fieldLines(k, val));
    const srcLoc = sec ? `§${sec.id} ${truncate(sec.heading, 50)}` : e.source?.section ? `§${e.source.section}` : '';
    lines.push(`SOURCE: ${srcLoc}${e.source?.excerpt ? ` "${truncate(e.source.excerpt, 140)}"` : ''} [${v.status}${v.foundIn ? ` → §${v.foundIn}` : ''}${v.via ? ` via ${v.via}` : ''}]`);
    if (l.out.length) lines.push(`LINKS_OUT: ${l.out.map((x) => `${x.id} (${x.rel})`).join(', ')}`);
    if (l.in.length) lines.push(`LINKS_IN: ${l.in.map((x) => `${x.id} (${x.rel})`).join(', ')}`);
    const c = analysis.coverage.perRequirement[id];
    if (c) lines.push(`COVERAGE: ${c.status}${c.untestedChecks.length ? ` — untested: ${c.untestedChecks.join(', ')}` : ''}${c.openGaps.length ? ` — open gaps: ${c.openGaps.join(', ')}` : ''}`);
    const fb = feedback.filter((f) => f.targetId === id);
    if (fb.length) lines.push(`FEEDBACK: ${fb.map((f) => `${f.id} ${f.status} "${truncate(f.message, 80)}"`).join(' | ')}`);
    blocks.push(lines.join('\n'));
    data.push({ kind, entity: e, source: v, links: l, coverage: c ?? null, feedback: fb });
  }
  if (flags.json) {
    emit({ title: 'ENTITIES', data: { entities: data } });
    return;
  }
  process.stdout.write(`${blocks.join('\n\n')}\n`);
}

// ---------------------------------------------------------------- feedback / poll / resolve

export async function feedback({ flags }) {
  const ws = findWorkspace(flags.dir);
  const list = ws.feedback();
  const model = ws.model({ required: false });
  const shown = list.filter((f) => (flags.all ? true : f.status === 'open')).filter((f) => !flags.target || f.targetId === flags.target);
  setCursor(ws, list);
  emit({
    title: `${flags.all ? 'ALL' : 'OPEN'} FEEDBACK: ${shown.length}`,
    fields: flags.all ? [] : [['RESOLVED', list.filter((f) => f.status === 'resolved').length], ['DISMISSED', list.filter((f) => f.status === 'dismissed').length]],
    sections: [{ title: 'ITEMS', lines: feedbackLines(shown, model) }],
    next: shown.length
      ? [
        'sherlock show <target-id>   # full context for an item',
        'apply changes: sherlock update <patch.json> --resolve FB-001,FB-002 --note "what changed"',
        'answer questions without model changes: sherlock resolve FB-003 --note "…"',
      ]
      : ['sherlock poll   # wait for QA feedback'],
    data: { items: shown },
  });
}

export async function poll({ flags }) {
  const ws = findWorkspace(flags.dir);
  const timeout = Number(flags.timeout ?? 300) * 1000;
  const settle = Number(flags.settle ?? 8) * 1000;
  const cursor = ws.read('state.json', {}).feedbackCursor ?? '';
  const fresh = () => ws.feedback().filter((f) => f.status === 'open' && f.updatedAt > cursor);
  const start = Date.now();
  let seen = fresh();
  let lastChange = seen.length ? Date.now() : 0;
  while (Date.now() - start < timeout) {
    if (seen.length && Date.now() - lastChange >= settle) break;
    await new Promise((r) => setTimeout(r, 1000));
    const now = fresh();
    if (now.length !== seen.length || now.some((f, i) => f.updatedAt !== seen[i]?.updatedAt)) {
      seen = now;
      lastChange = Date.now();
    }
  }
  const all = ws.feedback();
  if (!seen.length) {
    emit({
      title: 'NO NEW FEEDBACK',
      fields: [['WAITED', `${Math.round((Date.now() - start) / 1000)}s`], ['OPEN_FEEDBACK', all.filter((f) => f.status === 'open').length]],
      next: ['sherlock poll   # keep waiting', 'or ask the user whether they are done reviewing'],
      data: { items: [] },
    });
    return;
  }
  setCursor(ws, all);
  emit({
    title: `NEW FEEDBACK: ${seen.length}`,
    fields: [['OPEN_TOTAL', all.filter((f) => f.status === 'open').length]],
    sections: [{ title: 'ITEMS', lines: feedbackLines(seen, ws.model({ required: false })) }],
    next: [
      'sherlock show <target-id>',
      'sherlock update <patch.json> --resolve FB-… --note "…"',
      'sherlock resolve FB-… --note "…"   # answer without model changes',
    ],
    data: { items: seen },
  });
}

function resolveFeedback(ws, ids, { note, status = 'resolved', changedIds = [], revision = null }) {
  const list = ws.feedback();
  const missing = ids.filter((id) => !list.some((f) => f.id === id));
  if (missing.length) {
    throw new AxiError('FEEDBACK_NOT_FOUND', `Unknown feedback id(s): ${missing.join(', ')}`, { next: ['sherlock feedback --all'], exit: EXIT.NOT_FOUND });
  }
  const next = list.map((f) => (ids.includes(f.id)
    ? updateFeedback(f, { status, message: note ?? (status === 'resolved' ? 'Resolved.' : 'Dismissed.'), author: 'claude', changedIds, revision })
    : f));
  ws.write('feedback.json', next);
  return ids;
}

export async function resolve({ positional: ids, flags }) {
  if (!ids.length) throw new AxiError('USAGE', 'Missing feedback id.', { next: ['sherlock resolve FB-001 --note "…"'] });
  if (!flags.note) throw new AxiError('NOTE_REQUIRED', 'Explain the resolution for the QA with --note.', { next: [`sherlock resolve ${ids.join(' ')} --note "…"`] });
  const ws = findWorkspace(flags.dir);
  const status = flags.dismiss ? 'dismissed' : 'resolved';
  resolveFeedback(ws, ids, { note: flags.note, status, revision: ws.project().revision ?? null });
  const open = ws.feedback().filter((f) => f.status === 'open').length;
  emit({
    title: `FEEDBACK ${status.toUpperCase()}`,
    fields: [['IDS', ids.join(', ')], ['OPEN_FEEDBACK', open]],
    next: open ? ['sherlock feedback'] : ['sherlock poll   # wait for more QA feedback'],
  });
}

// ---------------------------------------------------------------- eval (golden regression)

export async function evalGolden({ positional: [goldenFile, modelFile], flags }) {
  if (!goldenFile) throw new AxiError('USAGE', 'Missing golden fixture path.', { next: ['sherlock eval fixtures/grants/golden.json [model.json]'] });
  const golden = readJsonFile(goldenFile);
  const ws = modelFile ? null : findWorkspace(flags.dir);
  const model = modelFile ? readJsonFile(modelFile) : ws.model();
  const r = evaluateGolden(model, golden);
  const missed = r.concepts.filter((c) => !c.hit).map((c) => `${c.id.padEnd(30)}${c.label}`);
  emit({
    title: r.pass ? 'GOLDEN PASS' : 'GOLDEN FAIL',
    fields: [
      ['FIXTURE', golden.name],
      ['RECALL', `${Math.round(r.recall * 100)}% (${r.hits}/${r.total}, threshold ${Math.round((golden.threshold ?? 0.85) * 100)}%)`],
      ['MODEL', Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ')],
    ],
    sections: [{ title: `MISSED CONCEPTS (${missed.length})`, lines: missed }],
    next: r.pass ? [] : ['re-read the PRD sections for the missed concepts and extend the model (sherlock update <patch>)'],
    data: r,
  });
  if (!r.pass) process.exitCode = EXIT.INVALID;
}

// ---------------------------------------------------------------- setup

export async function setup({ flags }) {
  const src = path.join(REPO_ROOT, 'skills/sherlock/SKILL.md');
  const base = flags.project ? path.resolve('.claude/skills') : path.join(os.homedir(), '.claude/skills');
  const dest = path.join(base, 'sherlock', 'SKILL.md');
  const cmd = `node "${BIN.replace(/\\/g, '/')}"`;
  const skill = fs.readFileSync(src, 'utf8').replaceAll('{{SHERLOCK}}', cmd);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, skill);
  const built = fs.existsSync(path.join(REPO_ROOT, 'apps/editor/out/index.html'));
  emit({
    title: 'SHERLOCK SKILL INSTALLED',
    fields: [['SKILL', dest], ['CLI', cmd], ['EDITOR', built ? 'built' : 'NOT BUILT']],
    next: [
      ...(built ? [] : [`npm run build   # in ${REPO_ROOT}`]),
      'in Claude Code: /sherlock path/to/prd.docx',
    ],
  });
}

// ---------------------------------------------------------------- help

export const HELP = `SHERLOCK — local QA workspace (agent interface)

USAGE: sherlock <command> [args] [--json] [--dir <project>]

PRD
  analyze <prd>            extract .docx/.pdf/.md → .sherlock/prd.md (+ section index)

MODEL
  create <model.json>      validate + install the first QA model
  update <file|->          apply full model or patch {upsert,merge,remove,project}
         [--resolve FB-1,FB-2 --note "…"]
  validate [file]          dry-run validation (errors, warnings, source checks)
  inspect                  compact status: counts, coverage, traceability, review state
  show <ID…>               one entity with links, coverage, source check, feedback

WORKSPACE
  open [--focus ID]        start local server (reused if running) and open browser
       [--no-browser] [--port N]
  stop                     stop the local server

FEEDBACK
  feedback [--all] [--target ID]   list QA feedback
  poll [--timeout 300] [--settle 8] block until new feedback arrives
  resolve <FB…> --note "…" [--dismiss]   reply + close without model changes

REGRESSION
  eval <golden.json> [model.json]  score a model against a golden QA fixture

SETUP
  setup [--project]        install the Claude Code skill (~/.claude/skills/sherlock)

EXIT CODES: 0 ok · 1 usage · 2 invalid · 3 not found · 4 server · 5 extraction`;
