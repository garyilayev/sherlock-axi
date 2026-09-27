'use client';
import { memo, useMemo, useState } from 'react';
import { ClassBadge, CoverageBadge, IdChip, SourceBadge, Icon } from './ui.jsx';
import { KINDS, titleOf, dirOf } from '../lib/meta.js';

const CLASSES = ['explicit', 'derived', 'inferred', 'ambiguous'];
const OPEN_GAP = (g) => !['resolved', 'answered', 'closed', 'dismissed'].includes(g.status);

function Seg({ options, value, onChange }) {
  // Many options (e.g. 16 test types) don't fit a segmented control.
  if (options.length > 6) {
    return (
      <select className="seg-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}{o.n != null ? ` (${o.n})` : ''}</option>)}
      </select>
    );
  }
  return (
    <div className="seg">
      {options.map((o) => (
        <button type="button" key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.n != null && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

function SourceCell({ e, a }) {
  const v = a.provenance.perEntity[e.id];
  const sec = v?.sectionId ?? e.source?.section;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {sec ? <span className="mono muted nowrap">§{sec}</span> : e.source?.requirementId ? <span className="mono faint">via {e.source.requirementId}</span> : null}
      {v && !['verified', 'paraphrased', 'section-only', 'inherited'].includes(v.status) && <SourceBadge status={v.status} />}
    </div>
  );
}

function columnsFor(kind, a, onOpen) {
  const cov = a.coverage.perRequirement;
  const linkCount = (id, k) => {
    const l = a.links[id] || { out: [], in: [] };
    return new Set([...l.out, ...l.in].map((x) => x.id).filter((x) => x.startsWith(KINDS[k].prefix + '-'))).size;
  };
  const common = { key: 'class', label: 'Class', render: (e) => <ClassBadge value={e.classification} />, width: 100 };
  // optional columns are dropped while the inspector is open, so titles keep room to breathe.
  const source = { key: 'src', label: 'Source', render: (e) => <SourceCell e={e} a={a} />, width: 110, optional: true };
  switch (kind) {
    case 'requirements':
      return [
        common,
        { key: 'cov', label: 'Coverage', width: 110, render: (e) => (
          <div className="stack" style={{ gap: 4 }}>
            <CoverageBadge status={cov[e.id]?.status} />
            {cov[e.id]?.ambiguous && <span className="badge ambiguous">Open gap</span>}
          </div>
        ) },
        { key: 'tests', label: 'Tests', width: 70, optional: true, render: (e) => <span className="mono">{cov[e.id]?.tests.length ?? 0}</span> },
        source,
      ];
    case 'testCases':
      return [
        { key: 'type', label: 'Type', width: 120, render: (e) => <span className="badge kind">{e.type ?? '–'}</span> },
        { key: 'prio', label: 'Priority', width: 90, optional: true, render: (e) => <span className={`badge ${e.priority === 'critical' || e.priority === 'high' ? 'warn' : ''}`}>{e.priority ?? '–'}</span> },
        { ...common, optional: true },
        { key: 'reqs', label: 'Requirements', width: 130, render: (e) => (
          <div className="row wrap" style={{ gap: 4 }}>{(e.requirementIds || []).map((r) => <IdChip key={r} id={r} onOpen={onOpen} />)}</div>
        ) },
      ];
    case 'flows':
      return [common, { key: 'steps', label: 'Steps', width: 70, optional: true, render: (e) => <span className="mono">{e.steps?.length ?? 0}</span> }, source];
    case 'screens':
      return [common, { key: 'tests', label: 'Tests', width: 70, optional: true, render: (e) => <span className="mono">{linkCount(e.id, 'testCases')}</span> }, source];
    case 'validations':
    case 'businessRules':
      return [
        common,
        { key: 'tested', label: 'Tested', width: 90, render: (e) => (a.coverage.untestedChecks.includes(e.id)
          ? <span className="badge bad">No tests</span>
          : <span className="badge ok">{linkCount(e.id, 'testCases')} tests</span>) },
        source,
      ];
    default:
      return [common, source];
  }
}

function GapList({ items, selectedId, onOpen, feedbackBy, changed }) {
  return (
    <div className="gap-cards">
      {items.map((g) => (
        <button type="button" key={g.id} className={`card gap-card ${selectedId === g.id ? 'selected' : ''} ${changed.has(g.id) ? 'flash' : ''}`} onClick={() => onOpen(g.id)}>
          <div className="row">
            <span className="id-chip">{g.id}</span>
            <span className={`badge ${OPEN_GAP(g) ? 'warn' : 'ok'}`}>{g.status ?? 'open'}</span>
            {g.priority && <span className="badge kind">{g.priority}</span>}
            {g.gapType && <span className="badge kind">{g.gapType}</span>}
            {changed.has(g.id) && <span className="badge new">updated</span>}
            {feedbackBy[g.id] && <span className="fb-dot" title="Has open feedback" />}
            <span className="grow" />
            {(g.relatedIds || []).slice(0, 4).map((r) => <span key={r} className="id-chip">{r}</span>)}
          </div>
          <div className="q" dir={dirOf(g.question || g.title)}>{g.question || g.title}</div>
          {g.impact && <div className="muted" dir={dirOf(g.impact)} style={{ fontSize: 13 }}>{g.impact}</div>}
        </button>
      ))}
    </div>
  );
}

const Row = memo(function Row({ e, cols, selected, changed, fb, onOpen }) {
  return (
    <tr className={`${selected ? 'selected' : ''} ${changed ? 'flash' : ''}`} onClick={() => onOpen(e.id)}>
      <td><span className="id-chip">{e.id}</span></td>
      <td className="title-cell">
        <div dir={dirOf(titleOf(e))}>
          {titleOf(e)}
          {fb > 0 && <span className="fb-dot" title={`${fb} open feedback`} />}
          {changed && <> <span className="badge new">updated</span></>}
        </div>
        {e.description && <div className="desc" dir={dirOf(e.description)}>{e.description}</div>}
      </td>
      {cols.map((c) => <td key={c.key}>{c.render(e)}</td>)}
    </tr>
  );
});

export default function EntityList({ kind, state, selectedId, onOpen, compact = false }) {
  const { model, analysis: a, feedback, project } = state;
  const list = model[kind] || [];
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [extra, setExtra] = useState('all');

  const changed = useMemo(() => {
    const ch = project?.lastChange;
    return new Set(ch && ch.type !== 'create' ? [...(ch.added || []), ...(ch.modified || [])] : []);
  }, [project]);
  const feedbackBy = useMemo(() => {
    const m = {};
    for (const f of feedback || []) if (f.status === 'open') m[f.targetId] = (m[f.targetId] || 0) + 1;
    return m;
  }, [feedback]);

  const extraOptions = useMemo(() => {
    if (kind === 'requirements') {
      const cov = a.coverage.perRequirement;
      const n = (s) => list.filter((r) => cov[r.id]?.status === s).length;
      return [
        { value: 'all', label: 'All' }, { value: 'covered', label: 'Covered', n: n('covered') },
        { value: 'partial', label: 'Partial', n: n('partial') }, { value: 'uncovered', label: 'Uncovered', n: n('uncovered') },
      ];
    }
    if (kind === 'testCases') {
      const types = [...new Set(list.map((t) => t.type).filter(Boolean))];
      return [{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: t, n: list.filter((x) => x.type === t).length }))];
    }
    if (kind === 'gaps') {
      return [
        { value: 'all', label: 'All' },
        { value: 'open', label: 'Open', n: list.filter(OPEN_GAP).length },
        { value: 'closed', label: 'Answered', n: list.filter((g) => !OPEN_GAP(g)).length },
      ];
    }
    return null;
  }, [kind, list, a]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((e) => {
      if (cls !== 'all' && e.classification !== cls) return false;
      if (extra !== 'all') {
        if (kind === 'requirements' && a.coverage.perRequirement[e.id]?.status !== extra) return false;
        if (kind === 'testCases' && e.type !== extra) return false;
        if (kind === 'gaps' && (extra === 'open') !== OPEN_GAP(e)) return false;
      }
      if (!s) return true;
      return [e.id, titleOf(e), e.description, e.expectedResult].some((v) => String(v ?? '').toLowerCase().includes(s));
    });
  }, [list, q, cls, extra, kind, a]);

  const cols = useMemo(() => columnsFor(kind, a, onOpen).filter((c) => !(compact && c.optional)), [kind, a, onOpen, compact]);
  const clsCounts = useMemo(() => Object.fromEntries(CLASSES.map((c) => [c, list.filter((e) => e.classification === c).length])), [list]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{KINDS[kind].label} <span className="faint" style={{ fontWeight: 500 }}>{list.length}</span></h1>
          {kind === 'gaps' && <p>Open questions where the PRD does not determine the expected behavior. Sherlock never silently turns these into requirements.</p>}
          {kind === 'requirements' && <p>A requirement is covered when it has tests and every linked validation and business rule is tested.</p>}
        </div>
      </div>
      <div className="toolbar">
        <input type="search" placeholder={`Filter ${KINDS[kind].label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg value={cls} onChange={setCls} options={[{ value: 'all', label: 'All' }, ...CLASSES.filter((c) => clsCounts[c]).map((c) => ({ value: c, label: c, n: clsCounts[c] }))]} />
        {extraOptions && <Seg value={extra} onChange={setExtra} options={extraOptions} />}
        <span className="grow" />
        <span className="faint" style={{ fontSize: 12 }}>{items.length} shown</span>
      </div>

      {kind === 'gaps' ? (
        <GapList items={items} selectedId={selectedId} onOpen={onOpen} feedbackBy={feedbackBy} changed={changed} />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 96 }}>ID</th>
                <th>{KINDS[kind].singular}</th>
                {cols.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <Row key={e.id} e={e} cols={cols} selected={selectedId === e.id} changed={changed.has(e.id)} fb={feedbackBy[e.id] || 0} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
          {!items.length && <div className="empty"><Icon name="search" /> Nothing matches these filters.</div>}
        </div>
      )}
    </div>
  );
}
