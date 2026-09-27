// Structural + semantic validation. Errors block writes; warnings are
// surfaced to Claude as actionable review items.

import { KINDS, KIND_KEYS, CLASSIFICATIONS, ID_PATTERN, kindOfId } from './schema.js';
import { buildGraph, computeCoverage } from './analyze.js';
import { verifySource } from './provenance.js';

const SOURCE_HINT = {
  'section-not-found': 'cited section does not exist in the PRD outline',
  'excerpt-not-found': 'excerpt not found in the PRD — quote the PRD verbatim',
  'section-mismatch': 'excerpt found in a different section',
  missing: 'no source — every item must trace to the PRD or a linked entity',
};

export function validateModel(model, { prd = null } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, id, message) => errors.push({ code, id, message });
  const warn = (code, id, message) => warnings.push({ code, id, message });

  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    err('MODEL_NOT_OBJECT', null, 'model must be a JSON object');
    return { ok: false, errors, warnings };
  }
  if (!model.project?.name) err('PROJECT_NAME_MISSING', null, 'project.name is required');

  const seen = new Set();
  for (const kind of KIND_KEYS) {
    const list = model[kind];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      err('COLLECTION_NOT_ARRAY', null, `${kind} must be an array`);
      continue;
    }
    list.forEach((e, i) => {
      const where = e?.id || `${kind}[${i}]`;
      if (!e || typeof e !== 'object') return err('ENTITY_NOT_OBJECT', where, 'entity must be an object');
      if (!e.id) return err('ID_MISSING', where, 'id is required');
      if (!ID_PATTERN.test(e.id)) return err('ID_INVALID', e.id, `expected ${KINDS[kind].prefix}-NNN`);
      if (kindOfId(e.id) !== kind) err('ID_WRONG_KIND', e.id, `belongs in ${kindOfId(e.id)}, found in ${kind}`);
      if (seen.has(e.id)) err('ID_DUPLICATE', e.id, 'duplicate id');
      seen.add(e.id);

      if (kind === 'gaps') {
        if (!e.question && !e.title) err('GAP_NO_QUESTION', e.id, 'gaps need a question');
      } else if (!e.title) err('TITLE_MISSING', e.id, 'title is required');

      if (e.classification === undefined) warn('CLASSIFICATION_MISSING', e.id, 'set explicit|derived|inferred|ambiguous');
      else if (!CLASSIFICATIONS.includes(e.classification)) {
        err('CLASSIFICATION_INVALID', e.id, `"${e.classification}" not in ${CLASSIFICATIONS.join('|')}`);
      }

      const v = verifySource(prd, e.source);
      if (SOURCE_HINT[v.status]) {
        const extra = v.foundIn ? ` (use section "${v.foundIn}")` : '';
        warn(`SOURCE_${v.status.toUpperCase().replace(/-/g, '_')}`, e.id, SOURCE_HINT[v.status] + extra);
      }

      if (kind === 'testCases') {
        if (!e.steps?.length) warn('TEST_NO_STEPS', e.id, 'test case has no steps');
        if (!e.expectedResult) warn('TEST_NO_EXPECTED', e.id, 'test case has no expectedResult');
      }
    });
  }

  if (errors.length) return { ok: false, errors, warnings };

  const graph = buildGraph(model);
  for (const d of graph.dangling) err('DANGLING_REF', d.from, `${d.rel} → ${d.to} does not exist`);

  const cov = computeCoverage(model, graph);
  for (const id of cov.orphanTests) warn('TEST_NO_REQUIREMENT', id, 'link to at least one requirement (requirementIds)');
  for (const [id, c] of Object.entries(cov.perRequirement)) {
    if (c.status === 'uncovered') warn('REQ_UNCOVERED', id, 'no test cases');
  }
  for (const id of cov.untestedChecks) warn('CHECK_UNTESTED', id, 'no test case references this rule/validation');

  // Never silently convert an assumption into a requirement.
  for (const kind of KIND_KEYS) {
    if (kind === 'gaps') continue;
    for (const e of model[kind] || []) {
      if (e.classification !== 'ambiguous') continue;
      const l = graph.links[e.id];
      const hasGap = [...(l?.out || []), ...(l?.in || [])].some((x) => kindOfId(x.id) === 'gaps');
      if (!hasGap) warn('AMBIGUOUS_WITHOUT_GAP', e.id, 'ambiguous item must link to a GAP-### open question');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
