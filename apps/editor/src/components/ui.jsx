'use client';
import { Fragment } from 'react';
import { SOURCE_STATUS, COVERAGE, ID_IN_TEXT, kindOfId } from '../lib/meta.js';
import { useI18n } from '../i18n/index.js';

const PATHS = {
  requirements: 'M4 4h12v12H4z M7 8h6 M7 11h6 M7 14h3',
  screens: 'M3 5h14v9H3z M7 17h6 M10 14v3',
  flows: 'M6 10m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0 M14 5m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0 M14 15m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0 M8 9l4-3 M8 11l4 3',
  actions: 'M11 3L5 11h5l-1 6 6-8h-5z',
  validations: 'M6 3.5h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z M8 7.5h4 M8 10.5h4 M8 13.5h2.5',
  businessRules: 'M5 4h10v12H5z M8 4v12 M8 8h7 M8 12h7',
  states: 'M6 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M14 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8 6h3a3 3 0 0 1 3 3v3',
  permissions: 'M6 9V7a4 4 0 0 1 8 0v2 M5 9h10v8H5z M10 12v2',
  testCases: 'M4 4.5h12v11H4z M4 8h12 M7 11.5h6',
  gaps: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M7.3 10.2l1.9 1.9 3.6-3.8',
  overview: 'M3.5 9L10 3.5 16.5 9 M5 8v8.5h3.5V12h3v4.5H15V8',
  file: 'M6 2.5h5.5L15 6v11.5H6z M11.5 2.5V6H15 M8 10h5 M8 13h5',
  monitor: 'M3 4.5h14v9.5H3z M7 17h6 M10 14v3',
  checkSquare: 'M4 4h12v12H4z M7 10.2l2.2 2.2L13.4 8',
  warning: 'M10 3.2L17.5 16.5h-15z M10 8.5v3.5 M10 14.2v.01',
  info: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M10 9.2v4.5 M10 6.6v.01',
  chevronRight: 'M8 5l5 5-5 5',
  chevronLeft: 'M12 5l-5 5 5 5',
  message: 'M4 4.5h12v8.5H9l-3.5 3v-3H4z M7 8h6 M7 10.5h4',
  clipboard: 'M7 3.5h6v2.5H7z M5.5 5h9v12.5h-9z M8 10.5h4 M8 13.5h4',
  flowNodes: 'M6 5m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0 M6 15m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0 M14.5 13m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0 M6 7.2v5.6 M8 6.2l4.8 5',
  feedback: 'M4 5h12v8H9l-3 3v-3H4z',
  prd: 'M6 3h6l3 3v11H6z M12 3v3h3 M8 10h5 M8 13h5',
  search: 'M9 4a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M13 13l4 4',
  close: 'M5 5l10 10 M15 5L5 15',
  check: 'M5 10.5l3.2 3L15 7',
  more: 'M5 10h.01 M10 10h.01 M15 10h.01',
  link: 'M8 12l4-4 M7 9L5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L10.5 12.5 M13 11l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7.5',
  arrow: 'M5 10h10 M11 6l4 4-4 4',
  globe: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M3 10h14 M10 3c2 2 2.8 4.5 2.8 7s-.8 5-2.8 7c-2-2-2.8-4.5-2.8-7s.8-5 2.8-7z',
  refresh: 'M15 6v3h-3 M5 14v-3h3 M14.5 9A5 5 0 0 0 6 7 M5.5 11A5 5 0 0 0 14 13',
};

// Directional icons mirror under dir="rtl" (see .flip-rtl in styles.css).
const DIRECTIONAL = new Set(['chevronLeft', 'chevronRight', 'arrow']);

export function Icon({ name, size = 16, className, style }) {
  const d = PATHS[name] || PATHS.overview;
  const cls = [className, DIRECTIONAL.has(name) && 'flip-rtl'].filter(Boolean).join(' ') || undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={cls} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Sherlock">
      <circle cx="13.5" cy="13.5" r="9" fill="none" stroke="#5b9cf5" strokeWidth="3" />
      <path d="M9.5 15.5c1.2 1.6 3.4 2.4 5.6 1.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20.3 20.3l7 7" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * User content (model / PRD text). Aligned to the UI direction, but each
 * paragraph orders its characters by its own content (unicode-bidi: plaintext),
 * so "Grant Price לא שלילי" reads correctly in both LTR and RTL.
 */
export function Bidi({ as: Tag = 'span', className, children, ...rest }) {
  return <Tag className={className ? `bidi ${className}` : 'bidi'} {...rest}>{children}</Tag>;
}

export function ClassBadge({ value }) {
  const { t, tv, has } = useI18n();
  if (!value) return null;
  return <span className={`badge ${value}`} title={has(`classification.help.${value}`) ? t(`classification.help.${value}`) : undefined}>{tv('classification', value)}</span>;
}

export function KindBadge({ kind, icon = false }) {
  const { tv } = useI18n();
  return (
    <span className="badge kind">{icon && <Icon name={kind} size={12} />}{tv('kind', kind)}</span>
  );
}

export function SourceBadge({ status }) {
  const { t } = useI18n();
  const s = SOURCE_STATUS[status] ? status : 'missing';
  return <span className={`badge ${SOURCE_STATUS[s]}`}>{t(`source.${s}`)}</span>;
}

export function CoverageBadge({ status }) {
  const { t } = useI18n();
  return COVERAGE[status] ? <span className={`badge ${COVERAGE[status]}`}>{t(`coverage.${status}`)}</span> : null;
}

/** IDs always render LTR in isolation, so TC-002 never shows up as 002-TC. */
export function IdChip({ id, onOpen, title }) {
  if (!onOpen) return <span className="id-chip" dir="ltr" title={title}>{id}</span>;
  return <button type="button" className="id-chip" dir="ltr" title={title} onClick={(e) => { e.stopPropagation(); onOpen(id); }}>{id}</button>;
}

/** Plain text with Sherlock IDs turned into clickable chips. */
export function LinkedText({ text, onOpen, as: Tag = 'span', className }) {
  const s = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(ID_IN_TEXT)) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    parts.push(kindOfId(m[0]) ? <IdChip key={m.index} id={m[0]} onOpen={onOpen} /> : m[0]);
    last = m.index + m[0].length;
  }
  parts.push(s.slice(last));
  return <Bidi as={Tag} className={className}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</Bidi>;
}

/**
 * Normalize like the provenance check (lowercase, letters/digits only, Hebrew
 * niqqud dropped) while remembering where each normalized char came from, so
 * a quote that verified in the CLI also highlights here.
 */
const NIQQUD = /[֑-ׇ]/; // Hebrew vowel points / cantillation

function normalizedIndex(text) {
  let norm = '';
  const at = [];
  let space = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (NIQQUD.test(ch)) continue;
    if (/[\p{L}\p{N}]/u.test(ch)) { norm += ch.toLowerCase(); at.push(i); space = false; }
    else if (!space) { norm += ' '; at.push(i); space = true; }
  }
  return { norm, at };
}

const normalizeFrag = (f) => normalizedIndex(f).norm.trim();

/** Highlight excerpt fragments (split on "…", "..." and table-cell "|") inside a string. */
export function Highlight({ text, excerpt }) {
  const s = String(text ?? '');
  const frags = String(excerpt ?? '')
    .split(/\.{3}|…|\|/)
    .map(normalizeFrag)
    .filter((f) => f.length >= 3);
  if (!frags.length) return s;
  const { norm, at } = normalizedIndex(s);
  const ranges = [];
  for (const f of frags) {
    const i = norm.indexOf(f);
    if (i >= 0) ranges.push([at[i], at[i + f.length - 1] + 1]);
  }
  if (!ranges.length) return s;
  ranges.sort((x, y) => x[0] - y[0]);
  const out = [];
  let pos = 0;
  ranges.forEach(([x, y], k) => {
    if (x < pos) return;
    out.push(s.slice(pos, x), <mark key={k}>{s.slice(x, y)}</mark>);
    pos = y;
  });
  out.push(s.slice(pos));
  return <>{out}</>;
}

/** Render extracted PRD text: paragraphs, "- " lists and "| a | b |" tables. */
export function PrdText({ text, excerpt }) {
  const blocks = String(text ?? '').split(/\n{2,}/).filter(Boolean);
  return blocks.map((b, i) => {
    const lines = b.split('\n');
    if (lines[0].startsWith('|')) {
      const rows = lines.filter((l) => !/^\|\s*-+/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [head, ...body] = rows;
      return (
        <table className="prd-table" key={i}>
          <thead><tr>{head.map((c, j) => <th key={j} className="bidi"><Highlight text={c} excerpt={excerpt} /></th>)}</tr></thead>
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="bidi"><Highlight text={c} excerpt={excerpt} /></td>)}</tr>)}</tbody>
        </table>
      );
    }
    if (lines.every((l) => l.startsWith('- '))) {
      return <ul key={i}>{lines.map((l, k) => <li key={k} className="bidi"><Highlight text={l.slice(2)} excerpt={excerpt} /></li>)}</ul>;
    }
    if (lines[0].startsWith('- ')) {
      return <ul key={i}><li className="bidi"><Highlight text={b.slice(2)} excerpt={excerpt} /></li></ul>;
    }
    return <p key={i} className="bidi"><Highlight text={b} excerpt={excerpt} /></p>;
  });
}

export function Bar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  return (
    <div className="bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      {parts.filter((p) => p.value).map((p) => (
        <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}
