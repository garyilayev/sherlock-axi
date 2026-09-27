// Sherlock QA model — the source of truth. Everything else (editor, CLI output,
// future exporters) is a projection of this structure.

/** Entity collections, in display order. `prefix` drives stable IDs. */
export const KINDS = {
  requirements: { prefix: 'REQ', label: 'Requirements', singular: 'Requirement' },
  screens: { prefix: 'SCREEN', label: 'Screens', singular: 'Screen' },
  flows: { prefix: 'FLOW', label: 'Flows', singular: 'Flow' },
  actions: { prefix: 'ACT', label: 'Actions', singular: 'Action' },
  validations: { prefix: 'VAL', label: 'Validations', singular: 'Validation' },
  businessRules: { prefix: 'RULE', label: 'Business Rules', singular: 'Business Rule' },
  states: { prefix: 'STATE', label: 'States', singular: 'State Model' },
  permissions: { prefix: 'PERM', label: 'Permissions', singular: 'Permission' },
  testCases: { prefix: 'TC', label: 'Test Cases', singular: 'Test Case' },
  gaps: { prefix: 'GAP', label: 'Gaps', singular: 'Gap' },
};

export const KIND_KEYS = Object.keys(KINDS);

export const CLASSIFICATIONS = ['explicit', 'derived', 'inferred', 'ambiguous'];

export const TEST_TYPES = [
  'happy-path', 'negative', 'boundary', 'empty', 'invalid', 'validation',
  'state-transition', 'permission', 'dependency', 'bulk', 'filter', 'sort',
  'lifecycle', 'error-handling', 'ui', 'integration',
];

export const PRIORITIES = ['critical', 'high', 'medium', 'low'];

const PREFIX_TO_KIND = Object.fromEntries(
  Object.entries(KINDS).map(([k, v]) => [v.prefix, k]),
);

export const ID_PATTERN = new RegExp(
  `^(${Object.values(KINDS).map((k) => k.prefix).join('|')})-(\\d{3,})$`,
);

/** Matches any Sherlock ID embedded in free text (used for links in prose). */
export const ID_IN_TEXT = new RegExp(
  `\\b(?:${Object.values(KINDS).map((k) => k.prefix).join('|')})-\\d{3,}\\b`,
  'g',
);

export function kindOfId(id) {
  const m = typeof id === 'string' && id.match(ID_PATTERN);
  return m ? PREFIX_TO_KIND[m[1]] : null;
}

export function emptyModel(name = 'Untitled') {
  return {
    schemaVersion: 1,
    project: { name, subtitle: 'QA Guide', summary: '', prd: null, keyFeatures: [] },
    ...Object.fromEntries(KIND_KEYS.map((k) => [k, []])),
  };
}

/** Entity title with sensible fallbacks (gaps are phrased as questions). */
export function titleOf(e) {
  return e?.title || e?.question || e?.name || e?.id || '';
}

export function nextId(model, kind) {
  const { prefix } = KINDS[kind];
  let max = 0;
  for (const e of model[kind] || []) {
    const m = String(e.id).match(ID_PATTERN);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Iterate every entity in the model as [kind, entity]. */
export function* entities(model) {
  for (const kind of KIND_KEYS) {
    for (const e of model?.[kind] || []) yield [kind, e];
  }
}
