import { KINDS, kindOfId, titleOf, ID_IN_TEXT } from '@sherlock/qa-model';

export { KINDS, kindOfId, titleOf, ID_IN_TEXT };

/** Sidebar order: primary QA views first, supporting model views after. */
export const PRIMARY = ['requirements', 'screens', 'flows', 'testCases', 'validations', 'gaps'];
export const SECONDARY = ['actions', 'businessRules', 'states', 'permissions'];

export const CLASS_HELP = {
  explicit: 'Directly stated in the PRD',
  derived: 'Logically follows from an explicit requirement',
  inferred: 'Standard QA reasoning, not specified in the PRD',
  ambiguous: 'The PRD does not determine the expected behavior',
};

export const SOURCE_STATUS = {
  verified: { tone: 'ok', label: 'Verified in PRD' },
  paraphrased: { tone: 'ok', label: 'Paraphrased' },
  'section-only': { tone: 'ok', label: 'Section cited' },
  inherited: { tone: 'ok', label: 'Via linked item' },
  'section-mismatch': { tone: 'warn', label: 'Found in another section' },
  'excerpt-not-found': { tone: 'bad', label: 'Excerpt not in PRD' },
  'section-not-found': { tone: 'bad', label: 'Section not in PRD' },
  missing: { tone: 'bad', label: 'No source' },
  'no-prd': { tone: 'muted', label: 'PRD not loaded' },
};

export const COVERAGE = {
  covered: { tone: 'ok', label: 'Covered' },
  partial: { tone: 'warn', label: 'Partial' },
  uncovered: { tone: 'bad', label: 'Uncovered' },
};

const RTL = /[֐-ࣿ]/;
/** Text direction for user content (PRDs may be RTL, e.g. Hebrew). */
export const dirOf = (text) => (RTL.test(String(text ?? '')) ? 'rtl' : 'ltr');

export function allEntities(model) {
  const out = [];
  for (const kind of Object.keys(KINDS)) for (const e of model?.[kind] || []) out.push({ kind, e });
  return out;
}

export function indexModel(model) {
  const byId = new Map();
  for (const { kind, e } of allEntities(model)) byId.set(e.id, { kind, e });
  return byId;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
