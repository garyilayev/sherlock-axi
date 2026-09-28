// Spotlight search: a small in-memory index over the model, the PRD, feedback
// and commands. Pure functions (no React / DOM) so they can be unit tested.
import { KINDS, PRIMARY, SECONDARY, titleOf, OPEN_GAP } from './meta.js';

const NIQQUD = /[֑-ׇ]/g;
/** Lowercase and drop Hebrew niqqud / cantillation marks. */
export const normalize = (s) => String(s ?? '').replace(NIQQUD, '').toLowerCase();

export const KIND_ORDER = [...PRIMARY, ...SECONDARY];
/** Tie-break order for groups: sidebar order, then commands, PRD and feedback last. */
export const GROUP_ORDER = [...KIND_ORDER, 'commands', 'prd', 'feedback'];
const BOOSTED = new Set(['requirements', 'testCases', 'gaps']);
const JUMP_VIEWS = ['overview', 'requirements', 'testCases', 'gaps', 'feedback', 'prd'];
const WORD_SPLIT = /[\s,.;:!?()[\]{}"'“”„/\\|<>–—-]+/;

function stepText(s) {
  if (typeof s === 'string') return s;
  return [s?.title ?? s?.action ?? s?.text ?? s?.step, s?.detail ?? s?.description ?? s?.expected ?? s?.result].filter(Boolean).join(' — ');
}

function makeItem({ group, id, title, fields = [], target, meta, key }) {
  const t = String(title ?? '');
  return {
    key: key ?? `${group}:${id}`,
    group,
    id: id ?? '',
    title: t,
    target,
    meta: meta ?? {},
    nId: normalize(id),
    nTitle: normalize(t),
    words: normalize(t).split(WORD_SPLIT).filter(Boolean),
    fields: fields.filter((f) => f != null && f !== '').map((f) => ({ text: String(f), n: normalize(f) })),
  };
}

/**
 * Build the search index once per model revision.
 * `prd` is the full PRD (with section text) when loaded, else the outline from state.
 */
export function buildIndex(state, prd, t, { langs = [], lang } = {}) {
  const items = [];
  const byId = new Map();
  const model = state?.model ?? {};
  const cov = state?.analysis?.coverage?.perRequirement ?? {};

  for (const kind of KIND_ORDER) {
    for (const e of model[kind] || []) {
      const title = titleOf(e);
      const item = makeItem({
        group: kind,
        id: e.id,
        title,
        fields: [
          e.question && e.question !== title ? e.question : null,
          e.description,
          e.expectedResult,
          ...(Array.isArray(e.steps) ? e.steps.map(stepText) : []),
          e.notes ?? e.rationale,
        ],
        target: { type: 'entity', id: e.id },
        meta: {
          classification: e.classification,
          coverage: kind === 'requirements' ? cov[e.id]?.status : undefined,
          type: kind === 'testCases' ? e.type : undefined,
          status: kind === 'gaps' ? e.status ?? 'open' : undefined,
        },
      });
      items.push(item);
      byId.set(e.id, item);
    }
  }

  for (const s of prd?.sections || []) {
    items.push(makeItem({
      group: 'prd',
      id: s.id,
      title: s.heading,
      fields: [s.text],
      target: { type: 'prd', sectionId: s.id },
    }));
  }

  for (const f of state?.feedback || []) {
    const item = makeItem({
      group: 'feedback',
      id: f.id,
      title: f.message,
      fields: (f.thread || []).map((r) => r.message),
      target: { type: 'view', view: 'feedback' },
      meta: { status: f.status },
    });
    items.push(item);
    byId.set(f.id, item);
  }

  const views = ['overview', ...KIND_ORDER.filter((k) => model[k]?.length), 'feedback', ...(prd ? ['prd'] : [])];
  const nav = JUMP_VIEWS.filter((v) => views.includes(v)).map((v) => makeItem({
    group: 'jumpTo', key: `nav:${v}`, id: '', title: t(`nav.${v}`), target: { type: 'view', view: v }, meta: { icon: v },
  }));

  const commands = [
    prd && { cmd: 'openPrd', title: t('command.openPrd'), icon: 'prd' },
    ...views.map((v) => ({ view: v, title: t('command.goTo', { name: t(`nav.${v}`) }), icon: v })),
    ...langs.filter((l) => l !== lang).map((l) => ({ cmd: 'lang', lang: l, title: t('language.switchTo', { name: t(`language.${l}`) }), icon: 'globe' })),
    { cmd: 'reload', title: t('command.reload'), icon: 'refresh' },
    { cmd: 'copyPath', title: t('command.copyPath'), icon: 'clipboard' },
  ].filter(Boolean);
  for (const c of commands) {
    items.push(makeItem({
      group: 'commands',
      key: `cmd:${c.cmd ?? 'view'}:${c.view ?? c.lang ?? ''}`,
      id: '',
      title: c.title,
      target: c.view ? { type: 'view', view: c.view } : { type: 'command', cmd: c.cmd, lang: c.lang },
      meta: { icon: c.icon },
    }));
  }

  return { items, byId, nav };
}

/** Map normalized offsets back to the original string (niqqud removal shifts them). */
function normalizedMap(text) {
  let n = '';
  const at = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/[֑-ׇ]/.test(ch)) continue;
    const low = ch.toLowerCase();
    for (let k = 0; k < low.length; k++) { n += low[k]; at.push(i); }
  }
  at.push(text.length);
  return { n, at };
}

/** Ranges [start, end) in `text` where any token occurs (niqqud- and case-insensitive), merged. */
export function matchRanges(text, tokens) {
  const s = String(text ?? '');
  if (!tokens?.length || !s) return [];
  const { n, at } = normalizedMap(s);
  const ranges = [];
  for (const tok of tokens) {
    if (!tok) continue;
    let i = n.indexOf(tok);
    while (i >= 0) {
      ranges.push([at[i], at[i + tok.length - 1] + 1]);
      i = n.indexOf(tok, i + tok.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

/** A one-line window of `text` around the first occurrence of `token`. */
export function snippet(text, token, width = 120) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  const r = matchRanges(s, [token])[0];
  if (!r) return s.slice(0, width);
  let start = Math.max(0, r[0] - Math.floor(width / 3));
  if (start > 0) {
    const sp = s.lastIndexOf(' ', r[0] - 1);
    if (sp >= start - 15 && sp < r[0]) start = sp + 1;
  }
  const end = Math.min(s.length, start + width);
  return `${start > 0 ? '…' : ''}${s.slice(start, end)}${end < s.length ? '…' : ''}`;
}

export function tokenize(query) {
  return normalize(query).trim().split(/\s+/).map((t) => t.replace(/^§/, '')).filter(Boolean);
}

/** Score one item, or null when some token doesn't match (AND semantics). */
function scoreItem(item, q, qId, tokens) {
  let score = 0;
  let hit = null;
  for (const tok of tokens) {
    if (item.nTitle.includes(tok)) {
      score += item.words.some((w) => w.startsWith(tok)) ? 80 : 40;
    } else if (item.nId.includes(tok)) {
      score += 10;
    } else {
      const f = item.fields.find((x) => x.n.includes(tok));
      if (!f) return null;
      score += 10;
      hit ??= { field: f.text, token: tok };
    }
  }
  if (item.nId && item.nId === qId) score += 1000;
  else if (item.nId && qId.length > 1 && item.nId.startsWith(qId)) score += 500;
  if (item.nTitle.startsWith(q)) score += 200;
  if (BOOSTED.has(item.group)) score += 5;
  return { score, hit };
}

const SECTION_QUERY = /^§?\s*\d+(\.\d+)*[a-z0-9/-]*$/i;

/**
 * Ranked, grouped results. Groups are ordered by their best score, ties by
 * GROUP_ORDER; each shows `limit` rows unless its group is in `expanded`.
 */
export function search(index, query, { limit = 5, expanded } = {}) {
  const q = normalize(query).trim();
  if (!q) return { groups: [], total: 0, tokens: [] };
  const tokens = tokenize(query);
  const qId = q.replace(/^§\s*/, '');
  const sectionJump = SECTION_QUERY.test(q);
  const buckets = new Map();
  let total = 0;
  for (const item of index.items) {
    const r = scoreItem(item, q, qId, tokens);
    if (!r) continue;
    // "§3.8" / "3.8" jumps straight to that PRD section.
    if (sectionJump && item.group === 'prd' && item.nId === qId) r.score += 5000;
    total++;
    if (!buckets.has(item.group)) buckets.set(item.group, []);
    buckets.get(item.group).push({ item, score: r.score, snippet: r.hit ? snippet(r.hit.field, r.hit.token) : null });
  }
  const groups = [...buckets.entries()].map(([group, rows]) => {
    rows.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id, undefined, { numeric: true }));
    const open = expanded?.has(group);
    return { group, total: rows.length, top: rows[0].score, rows: open ? rows : rows.slice(0, limit), more: open ? 0 : Math.max(0, rows.length - limit) };
  });
  groups.sort((a, b) => b.top - a.top || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  return { groups, total, tokens };
}

/** Empty-query suggestions: Jump to, Recent, Needs attention. */
export function suggestions(index, state, recentIds = []) {
  const groups = [];
  groups.push({ group: 'jumpTo', rows: index.nav.map((item) => ({ item })) });
  const recent = recentIds.map((id) => index.byId.get(id)).filter(Boolean).slice(0, 6);
  if (recent.length) groups.push({ group: 'recent', rows: recent.map((item) => ({ item })) });
  const model = state?.model ?? {};
  const cov = state?.analysis?.coverage?.perRequirement ?? {};
  const attention = [
    ...(model.gaps || []).filter(OPEN_GAP).slice(0, 3),
    ...(model.requirements || []).filter((r) => cov[r.id]?.status === 'uncovered').slice(0, 3),
    ...(state?.feedback || []).filter((f) => f.status === 'open').slice(0, 3),
  ].map((e) => index.byId.get(e.id)).filter(Boolean);
  if (attention.length) groups.push({ group: 'attention', rows: attention.map((item) => ({ item })) });
  return { groups, total: groups.reduce((n, g) => n + g.rows.length, 0), tokens: [] };
}

