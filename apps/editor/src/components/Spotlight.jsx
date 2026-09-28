'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Bidi, ClassBadge, CoverageBadge } from './ui.jsx';
import { useI18n } from '../i18n/index.js';
import { KINDS, OPEN_GAP, dirOf } from '../lib/meta.js';
import { buildIndex, search, suggestions, matchRanges } from '../lib/search.js';
import { getRecent } from '../lib/recent.js';

// The query survives closing and reopening (session only, not persisted).
let lastQuery = '';

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const shortcutLabel = () => (isMac() ? '⌘K' : 'Ctrl K');

function Marked({ text, tokens }) {
  const ranges = matchRanges(text, tokens);
  if (!ranges.length) return text;
  const out = [];
  let pos = 0;
  ranges.forEach(([a, b], i) => {
    out.push(text.slice(pos, a), <mark key={i}>{text.slice(a, b)}</mark>);
    pos = b;
  });
  out.push(text.slice(pos));
  return <>{out.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

function iconFor(item) {
  if (KINDS[item.group]) return item.group;
  if (item.group === 'prd') return 'prd';
  if (item.group === 'feedback') return 'feedback';
  return item.meta.icon ?? 'arrow';
}

function Meta({ item }) {
  const { tv } = useI18n();
  const m = item.meta;
  const group = item.group;
  return (
    <span className="sl-meta">
      {m.classification && <ClassBadge value={m.classification} />}
      {m.coverage && <CoverageBadge status={m.coverage} />}
      {m.type && <span className="badge kind">{tv('testType', m.type)}</span>}
      {m.status && group === 'gaps' && <span className={`badge ${OPEN_GAP(m) ? 'warn' : 'ok'}`}>{tv('status.gap', m.status)}</span>}
      {m.status && group === 'feedback' && <span className={`badge ${m.status === 'open' ? 'warn' : 'ok'}`}>{tv('status.feedback', m.status)}</span>}
    </span>
  );
}

function groupLabel(group, t) {
  if (KINDS[group]) return t(`nav.${group}`);
  return { commands: t('search.commands'), prd: t('search.prdSections'), feedback: t('search.feedback'), jumpTo: t('search.jumpTo'), recent: t('search.recent'), attention: t('search.attention') }[group] ?? group;
}

/**
 * Apple-Spotlight-style search overlay. `onSelect(target, keepOpen)` performs
 * the action; the parent closes the overlay first unless keepOpen.
 */
export default function Spotlight({ state, prd, onClose, onSelect }) {
  const { t, lang, langs } = useI18n();
  const [query, setQuery] = useState(lastQuery);
  const [debounced, setDebounced] = useState(lastQuery);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const input = useRef(null);
  const panel = useRef(null);
  const returnTo = useRef(null);

  // Focus the input with the previous query selected; give focus back on close.
  useEffect(() => {
    returnTo.current = document.activeElement;
    input.current?.focus();
    input.current?.select();
    return () => { if (returnTo.current?.isConnected) returnTo.current.focus?.(); };
  }, []);

  useEffect(() => {
    lastQuery = query;
    const h = setTimeout(() => { setDebounced(query); setActive(0); setExpanded(new Set()); }, 60);
    return () => clearTimeout(h);
  }, [query]);

  const revision = state?.project?.revision;
  const index = useMemo(
    () => buildIndex(state, prd, t, { langs, lang }),
    [revision, state?.feedback, prd, t, langs, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hasQuery = debounced.trim().length > 0;
  const results = useMemo(
    () => (hasQuery ? search(index, debounced, { expanded }) : suggestions(index, state, getRecent())),
    [index, debounced, expanded, hasQuery], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // One flat list of selectable rows across groups (for ↑/↓ and aria-activedescendant).
  const options = useMemo(() => {
    const out = [];
    for (const g of results.groups) {
      for (const row of g.rows) out.push({ type: 'item', row, group: g.group });
      if (g.more) out.push({ type: 'more', group: g.group, count: g.total });
    }
    return out;
  }, [results]);

  useEffect(() => {
    document.getElementById(`sl-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, options]);

  const choose = (opt, keepOpen = false) => {
    if (!opt) return;
    if (opt.type === 'more') {
      setExpanded((x) => new Set(x).add(opt.group));
      return;
    }
    onSelect(opt.row.item.target, keepOpen);
  };

  const onKeyDown = (e) => {
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (n) setActive((a) => (a + 1) % n); break;
      case 'ArrowUp': e.preventDefault(); if (n) setActive((a) => (a - 1 + n) % n); break;
      case 'Home': if (n) { e.preventDefault(); setActive(0); } break;
      case 'End': if (n) { e.preventDefault(); setActive(n - 1); } break;
      case 'Enter': e.preventDefault(); choose(options[active], e.ctrlKey || e.metaKey); break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (query) setQuery(''); else onClose();
        break;
      case 'Tab': {
        // Trap focus inside the panel.
        const f = [...panel.current.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])')];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
        break;
      }
      default:
    }
  };

  let optIndex = -1;
  const activeId = options.length ? `sl-opt-${active}` : undefined;

  return (
    <div className="sl-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="sl-panel" role="dialog" aria-modal="true" aria-label={t('search.open')} onKeyDown={onKeyDown}>
        <div className="sl-input">
          <Icon name="search" size={20} className="sl-mag" />
          <input
            ref={input}
            dir="auto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.open')}
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls="sl-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="sl-list" id="sl-list" role="listbox" aria-label={t('search.open')}>
          {results.groups.map((g) => (
            <div key={g.group} role="group" aria-labelledby={`sl-g-${g.group}`}>
              <div className="sl-group" id={`sl-g-${g.group}`} role="presentation">{groupLabel(g.group, t)}</div>
              {g.rows.map((row) => {
                const i = ++optIndex;
                const { item } = row;
                return (
                  <div
                    key={item.key}
                    id={`sl-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`sl-row ${i === active ? 'active' : ''}`}
                    onMouseMove={() => { if (i !== active) setActive(i); }}
                    onMouseDown={(e) => { e.preventDefault(); choose(options[i], e.ctrlKey || e.metaKey); }}
                  >
                    <Icon name={iconFor(item)} size={16} className="sl-icon" />
                    {item.id && <bdi className="sl-id" dir="ltr">{item.group === 'prd' ? `§${item.id}` : item.id}</bdi>}
                    <span className="sl-main">
                      <Bidi className="sl-title"><Marked text={item.title} tokens={results.tokens} /></Bidi>
                      {row.snippet && <span className="sl-snippet" dir={dirOf(row.snippet)}><Marked text={row.snippet} tokens={results.tokens} /></span>}
                    </span>
                    <Meta item={item} />
                  </div>
                );
              })}
              {g.more > 0 && (() => {
                const i = ++optIndex;
                return (
                  <div
                    id={`sl-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`sl-row sl-more ${i === active ? 'active' : ''}`}
                    onMouseMove={() => { if (i !== active) setActive(i); }}
                    onMouseDown={(e) => { e.preventDefault(); choose(options[i]); }}
                  >
                    {t('search.showAll', { count: g.total })}
                  </div>
                );
              })()}
            </div>
          ))}
          {hasQuery && results.total === 0 && (
            <div className="sl-empty">
              <div>{t('search.noResults', { query: debounced.trim() })}</div>
              <div className="faint">{t('search.noResultsHint')}</div>
            </div>
          )}
        </div>
        <div className="sl-foot">
          <span><kbd dir="ltr">↑↓</kbd> {t('search.hintNavigate')}</span>
          <span><kbd>↵</kbd> {t('search.hintOpen')}</span>
          <span><kbd>Esc</kbd> {t('search.hintClose')}</span>
          <span className="grow" />
          {hasQuery && <span>{t('search.results', { count: results.total })}</span>}
        </div>
      </div>
    </div>
  );
}
