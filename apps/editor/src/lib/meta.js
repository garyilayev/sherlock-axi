import { KINDS, kindOfId, titleOf, ID_IN_TEXT } from '@sherlock/qa-model';

export { KINDS, kindOfId, titleOf, ID_IN_TEXT };

/** Sidebar order: primary QA views first, supporting model views after. */
export const PRIMARY = ['requirements', 'screens', 'flows', 'testCases', 'validations', 'gaps'];
export const SECONDARY = ['actions', 'businessRules', 'states', 'permissions'];

export const CLASSIFICATIONS = ['explicit', 'derived', 'inferred', 'ambiguous'];

/** Source-check status → badge tone. Labels live in i18n (`source.<status>`). */
export const SOURCE_STATUS = {
  verified: 'ok',
  paraphrased: 'ok',
  'section-only': 'ok',
  inherited: 'ok',
  'section-mismatch': 'warn',
  'excerpt-not-found': 'bad',
  'section-not-found': 'bad',
  missing: 'bad',
  'no-prd': 'muted',
};

/** Coverage status → badge tone. Labels live in i18n (`coverage.<status>`). */
export const COVERAGE = { covered: 'ok', partial: 'warn', uncovered: 'bad' };

export const OPEN_GAP = (g) => !['resolved', 'answered', 'closed', 'dismissed'].includes(g.status);

const RTL = /[֐-ࣿ]/;
/** Direction of a piece of user content. Only used for Spotlight snippets; everything else follows the UI direction. */
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
