// Derived views over the QA model: the traceability graph, requirement
// coverage, provenance status and summary statistics. Pure functions — the
// CLI and editor both consume the result, so there is one definition of
// "covered" and "traced".

import { KINDS, KIND_KEYS, CLASSIFICATIONS, ID_PATTERN, kindOfId, entities, titleOf } from './schema.js';
import { verifySource, TRUSTED_SOURCE } from './provenance.js';

const SKIP_KEYS = new Set(['id', 'source', 'title', 'description', 'question', 'excerpt']);

/** Collect every outgoing reference from an entity as {id, rel}. */
export function referencesOf(entity) {
  const refs = [];
  const walk = (value, rel) => {
    if (typeof value === 'string') {
      if (ID_PATTERN.test(value) && value !== entity.id) refs.push({ id: value, rel });
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, rel));
    } else if (value && typeof value === 'object') {
      if (typeof value.target === 'string' && value.type) {
        walk(value.target, value.type);
        return;
      }
      for (const [k, v] of Object.entries(value)) walk(v, rel === 'relationships' ? k : rel ?? k);
    }
  };
  for (const [k, v] of Object.entries(entity)) {
    if (SKIP_KEYS.has(k)) continue;
    walk(v, k);
  }
  // A source may point at a requirement (e.g. gaps: { requirementId }).
  if (entity.source && typeof entity.source === 'object') {
    for (const k of ['requirementId', 'entityId', 'derivedFrom']) {
      if (ID_PATTERN.test(entity.source[k] ?? '')) refs.push({ id: entity.source[k], rel: 'source' });
    }
  }
  const seen = new Set();
  return refs.filter((r) => {
    const key = `${r.id}|${r.rel}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export function buildGraph(model) {
  const byId = new Map();
  for (const [kind, e] of entities(model)) byId.set(e.id, { kind, entity: e });

  const links = {};
  const dangling = [];
  const ensure = (id) => (links[id] ??= { out: [], in: [] });
  for (const [, e] of entities(model)) {
    ensure(e.id);
    for (const ref of referencesOf(e)) {
      if (!byId.has(ref.id)) {
        dangling.push({ from: e.id, to: ref.id, rel: ref.rel });
        continue;
      }
      if (!links[e.id].out.some((l) => l.id === ref.id)) links[e.id].out.push(ref);
      const back = ensure(ref.id).in;
      if (!back.some((l) => l.id === e.id)) back.push({ id: e.id, rel: ref.rel });
    }
  }
  return { byId, links, dangling };
}

function neighbors(links, id, kind) {
  const l = links[id];
  if (!l) return [];
  const ids = new Set([...l.out, ...l.in].map((x) => x.id));
  return [...ids].filter((x) => !kind || kindOfId(x) === kind);
}

const OPEN_GAP = (g) => !['resolved', 'answered', 'closed', 'dismissed'].includes(g?.status);

export function computeCoverage(model, graph = buildGraph(model)) {
  const { links, byId } = graph;
  const perRequirement = {};
  for (const req of model.requirements || []) {
    const tests = neighbors(links, req.id, 'testCases');
    const checks = [
      ...neighbors(links, req.id, 'validations'),
      ...neighbors(links, req.id, 'businessRules'),
    ];
    const untestedChecks = checks.filter((c) => neighbors(links, c, 'testCases').length === 0);
    const gaps = neighbors(links, req.id, 'gaps').filter((g) => OPEN_GAP(byId.get(g)?.entity));
    const status = tests.length === 0 ? 'uncovered' : untestedChecks.length ? 'partial' : 'covered';
    perRequirement[req.id] = { status, tests, checks, untestedChecks, openGaps: gaps, ambiguous: gaps.length > 0 };
  }
  const vals = Object.values(perRequirement);
  const total = vals.length;
  const count = (s) => vals.filter((v) => v.status === s).length;
  const summary = {
    total,
    covered: count('covered'),
    partial: count('partial'),
    uncovered: count('uncovered'),
    ambiguous: vals.filter((v) => v.ambiguous).length,
    percent: total ? Math.round((count('covered') / total) * 100) : 0,
  };
  const orphanTests = (model.testCases || [])
    .filter((t) => neighbors(links, t.id, 'requirements').length === 0)
    .map((t) => t.id);
  const untestedChecks = [...(model.validations || []), ...(model.businessRules || [])]
    .filter((c) => neighbors(links, c.id, 'testCases').length === 0)
    .map((c) => c.id);
  return { perRequirement, summary, orphanTests, untestedChecks };
}

export function computeProvenance(model, prd) {
  const perEntity = {};
  for (const [, e] of entities(model)) perEntity[e.id] = verifySource(prd, e.source);
  const all = Object.entries(perEntity);
  const trusted = all.filter(([, v]) => TRUSTED_SOURCE.has(v.status)).length;
  const issues = all
    .filter(([, v]) => !TRUSTED_SOURCE.has(v.status) && v.status !== 'no-prd')
    .map(([id, v]) => ({ id, ...v }));
  // Reverse index: which entities cite each PRD section.
  const bySection = {};
  for (const [id, v] of all) if (v.sectionId) (bySection[v.sectionId] ??= []).push(id);
  return {
    perEntity,
    issues,
    bySection,
    traceability: all.length ? Math.round((trusted / all.length) * 100) : 0,
    verified: all.filter(([, v]) => v.status === 'verified').length,
    total: all.length,
  };
}

export function computeStats(model) {
  const counts = {};
  const breakdown = {};
  for (const kind of KIND_KEYS) {
    const list = model[kind] || [];
    counts[kind] = list.length;
    breakdown[kind] = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0]));
    for (const e of list) if (e.classification in breakdown[kind]) breakdown[kind][e.classification]++;
  }
  return { counts, breakdown };
}

/** One-shot analysis consumed by the CLI and the editor. */
export function analyzeModel(model, { prd = null, feedback = [] } = {}) {
  const graph = buildGraph(model);
  const coverage = computeCoverage(model, graph);
  const provenance = computeProvenance(model, prd);
  const stats = computeStats(model);
  const openGaps = (model.gaps || []).filter(OPEN_GAP).length;
  const openFeedback = feedback.filter((f) => f.status === 'open').length;
  const reviewStatus =
    openFeedback || openGaps || provenance.issues.length || coverage.summary.uncovered
      ? 'needs-review'
      : 'ready';
  return {
    links: graph.links,
    dangling: graph.dangling,
    coverage,
    provenance,
    stats,
    openGaps,
    openFeedback,
    reviewStatus,
  };
}

export { titleOf, KINDS };
