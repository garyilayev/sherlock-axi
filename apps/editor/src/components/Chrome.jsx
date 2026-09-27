'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Logo, KindBadge } from './ui.jsx';
import { KINDS, PRIMARY, SECONDARY, allEntities, titleOf, dirOf } from '../lib/meta.js';

export const VIEW_LABEL = { overview: 'Overview', feedback: 'Feedback', prd: 'PRD Source', ...Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])) };

function Search({ model, onOpen }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName))) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return allEntities(model)
      .filter(({ e }) => e.id.toLowerCase().includes(s) || titleOf(e).toLowerCase().includes(s) || (e.description || '').toLowerCase().includes(s))
      .slice(0, 12);
  }, [q, model]);

  const pick = (r) => {
    if (!r) return;
    onOpen(r.e.id);
    setQ('');
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="search">
      <Icon name="search" size={15} className="icon" />
      <input
        ref={ref}
        value={q}
        placeholder="Search IDs, titles…"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') pick(results[active]);
          if (e.key === 'Escape') { setQ(''); ref.current?.blur(); }
        }}
        aria-label="Search the QA model"
      />
      {!q && <kbd>/</kbd>}
      {open && results.length > 0 && (
        <div className="search-results" role="listbox">
          {results.map((r, i) => (
            <button key={r.e.id} type="button" className={i === active ? 'active' : ''} onMouseDown={() => pick(r)}>
              <span className="id-chip">{r.e.id}</span>
              <span className="grow" dir={dirOf(titleOf(r.e))} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(r.e)}</span>
              <KindBadge kind={r.kind} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header({ state, status, onOpen, navigate, refresh }) {
  const [menu, setMenu] = useState(false);
  const project = state?.model?.project;
  const label = status === 'live' ? 'Local' : status === 'connecting' ? 'Connecting' : 'Offline';
  return (
    <header className="header">
      <div className="brand"><Logo /> Sherlock</div>
      <div className="header-spacer" />
      {state?.model && <Search model={state.model} onOpen={onOpen} />}
      <span className={`local-pill ${status === 'live' ? '' : status}`} title={status === 'live' ? 'Connected to the local Sherlock server — changes appear live' : 'Local server not reachable'}>
        <span className="dot" />{label}
      </span>
      <button type="button" className="btn" onClick={() => navigate('prd')} disabled={!state?.prd}>
        Open PRD
      </button>
      <div className="menu">
        <button type="button" className="btn icon-btn" aria-label="More" onClick={() => setMenu((m) => !m)}><Icon name="more" /></button>
        {menu && (
          <div className="menu-pop" onMouseLeave={() => setMenu(false)}>
            <button type="button" onClick={() => { refresh(); setMenu(false); }}>Reload model</button>
            <button type="button" onClick={() => { navigate('feedback'); setMenu(false); }}>All feedback</button>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(state?.workspace ?? ''); setMenu(false); }}>Copy workspace path</button>
            <div className="meta">
              {state?.prd?.document && <>PRD: {state.prd.document}<br /></>}
              {state?.workspace}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export function Sidebar({ state, route, navigate }) {
  const model = state?.model;
  const a = state?.analysis;
  const openFb = (state?.feedback || []).filter((f) => f.status === 'open').length;
  const item = (view, label, count, extra) => (
    <button key={view} type="button" className={`nav-item ${route.view === view ? 'active' : ''}`} onClick={() => navigate(view)}>
      <Icon name={view} size={16} />
      <span>{label}</span>
      {extra ?? (count != null && <span className="count">{count}</span>)}
    </button>
  );
  const secondary = SECONDARY.filter((k) => model?.[k]?.length);
  return (
    <nav className="sidebar" aria-label="QA guide">
      <div className="project-card">
        <span className="pc-icon"><Icon name="file" size={20} /></span>
        <div className="grow">
          <h2 dir={dirOf(model?.project?.name)}>{model?.project?.name ?? 'Sherlock'}</h2>
          <div className="sub">{model?.project?.subtitle ?? 'QA Guide'}</div>
        </div>
      </div>
      <div className="nav-group">
        {item('overview', 'Overview')}
        {PRIMARY.map((k) => item(k, KINDS[k].label, model?.[k]?.length ?? 0,
          k === 'gaps' && a?.openGaps ? <span className="alert" title="Open gaps">{a.openGaps}</span> : undefined))}
      </div>
      {secondary.length > 0 && (
        <div className="nav-group">
          <div className="nav-label">Model</div>
          {secondary.map((k) => item(k, KINDS[k].label, model[k].length))}
        </div>
      )}
      <div className="nav-group">
        <div className="nav-label">Review</div>
        {item('feedback', 'Feedback', null, openFb ? <span className="alert" title="Open feedback">{openFb}</span> : <span className="count">{state?.feedback?.length ?? 0}</span>)}
        {item('prd', 'PRD Source', state?.prd?.sections?.length)}
      </div>
      {state?.prd?.document && (
        <div className="sidebar-foot">
          <Icon name="checkSquare" size={16} />
          <div>
            Generated from PRD<br />
            <span style={{ wordBreak: 'break-all' }}>{state.prd.document}</span><br />
            by Claude Code + Sherlock
            <div className="date">
              Rev {state.project?.revision ?? 0}
              {state.project?.updatedAt && ` · ${new Date(state.project.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
