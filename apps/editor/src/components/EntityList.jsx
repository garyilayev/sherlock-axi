'use client';
import { memo, useMemo, useState } from 'react';
import { ClassBadge, CoverageBadge, IdChip, SourceBadge, Icon, Bidi } from './ui.jsx';
import { KINDS, titleOf, CLASSIFICATIONS as CLASSES, OPEN_GAP } from '../lib/meta.js';
import { useI18n } from '../i18n/index.js';

function Seg({ options, value, onChange }) {
  const { t } = useI18n();
  // Many options (e.g. 16 test types) don't fit a segmented control.
  if (options.length > 6) {
    return (
      <select className="seg-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('list.filterAria')}>
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
  const { t } = useI18n();
  const v = a.provenance.perEntity[e.id];
  const sec = v?.sectionId ?? e.source?.section;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {sec ? <span className="mono muted nowrap" dir="ltr">§{sec}</span> : e.source?.requirementId ? <span className="mono faint">{t('list.via', { id: <bdi dir="ltr">{e.source.requirementId}</bdi> })}</span> : null}
      {v && !['verified', 'paraphrased', 'section-only', 'inherited'].includes(v.status) && <SourceBadge status={v.status} />}
    </div>
  );
}

function columnsFor(kind, a, onOpen, t, tv) {
  const cov = a.coverage.perRequirement;
  const linkCount = (id, k) => {
    const l = a.links[id] || { out: [], in: [] };
    return new Set([...l.out, ...l.in].map((x) => x.id).filter((x) => x.startsWith(KINDS[k].prefix + '-'))).size;
  };
  const common = { key: 'class', label: t('list.col.class'), render: (e) => <ClassBadge value={e.classification} />, width: 100 };
  // optional columns are dropped while the inspector is open, so titles keep room to breathe.
  const source = { key: 'src', label: t('list.col.source'), render: (e) => <SourceCell e={e} a={a} />, width: 110, optional: true };
  switch (kind) {
    case 'requirements':
      return [
        common,
        { key: 'cov', label: t('list.col.coverage'), width: 110, render: (e) => (
          <div className="stack" style={{ gap: 4 }}>
            <CoverageBadge status={cov[e.id]?.status} />
            {cov[e.id]?.ambiguous && <span className="badge ambiguous">{t('coverage.openGap')}</span>}
          </div>
        ) },
        { key: 'tests', label: t('list.col.tests'), width: 70, optional: true, render: (e) => <span className="mono">{cov[e.id]?.tests.length ?? 0}</span> },
        source,
      ];
    case 'testCases':
      return [
        { key: 'type', label: t('list.col.type'), width: 120, render: (e) => <span className="badge kind">{tv('testType', e.type) || '–'}</span> },
        { key: 'prio', label: t('list.col.priority'), width: 90, optional: true, render: (e) => <span className={`badge ${e.priority === 'critical' || e.priority === 'high' ? 'warn' : ''}`}>{tv('priority', e.priority) || '–'}</span> },
        { ...common, optional: true },
        { key: 'reqs', label: t('list.col.requirements'), width: 130, render: (e) => (
          <div className="row wrap" style={{ gap: 4 }}>{(e.requirementIds || []).map((r) => <IdChip key={r} id={r} onOpen={onOpen} />)}</div>
        ) },
      ];
    case 'flows':
      return [common, { key: 'steps', label: t('list.col.steps'), width: 70, optional: true, render: (e) => <span className="mono">{e.steps?.length ?? 0}</span> }, source];
    case 'screens':
      return [common, { key: 'tests', label: t('list.col.tests'), width: 70, optional: true, render: (e) => <span className="mono">{linkCount(e.id, 'testCases')}</span> }, source];
    case 'validations':
    case 'businessRules':
      return [
        common,
        { key: 'tested', label: t('list.col.tested'), width: 90, render: (e) => (a.coverage.untestedChecks.includes(e.id)
          ? <span className="badge bad">{t('coverage.noTests')}</span>
          : <span className="badge ok">{t('coverage.tests', { count: linkCount(e.id, 'testCases') })}</span>) },
        source,
      ];
    default:
      return [common, source];
  }
}

function GapList({ items, selectedId, onOpen, feedbackBy, changed }) {
  const { t, tv } = useI18n();
  return (
    <div className="gap-cards">
      {items.map((g) => (
        <button type="button" key={g.id} className={`card gap-card ${selectedId === g.id ? 'selected' : ''} ${changed.has(g.id) ? 'flash' : ''}`} onClick={() => onOpen(g.id)}>
          <div className="row">
            <IdChip id={g.id} />
            <span className={`badge ${OPEN_GAP(g) ? 'warn' : 'ok'}`}>{tv('status.gap', g.status ?? 'open')}</span>
            {g.priority && <span className="badge kind">{tv('priority', g.priority)}</span>}
            {g.gapType && <span className="badge kind">{g.gapType}</span>}
            {changed.has(g.id) && <span className="badge new">{t('status.updated')}</span>}
            {feedbackBy[g.id] && <span className="fb-dot" title={t('list.hasFeedback', { count: feedbackBy[g.id] })} />}
            <span className="grow" />
            {(g.relatedIds || []).slice(0, 4).map((r) => <IdChip key={r} id={r} />)}
          </div>
          <Bidi as="div" className="q">{g.question || g.title}</Bidi>
          {g.impact && <Bidi as="div" className="muted" style={{ fontSize: 13 }}>{g.impact}</Bidi>}
        </button>
      ))}
    </div>
  );
}

const Row = memo(function Row({ e, cols, selected, changed, fb, onOpen }) {
  const { t } = useI18n();
  return (
    <tr className={`${selected ? 'selected' : ''} ${changed ? 'flash' : ''}`} onClick={() => onOpen(e.id)}>
      <td><IdChip id={e.id} /></td>
      <td className="title-cell">
        <div>
          <Bidi>{titleOf(e)}</Bidi>
          {fb > 0 && <span className="fb-dot" title={t('list.hasFeedback', { count: fb })} />}
          {changed && <> <span className="badge new">{t('status.updated')}</span></>}
        </div>
        {e.description && <Bidi as="div" className="desc">{e.description}</Bidi>}
      </td>
      {cols.map((c) => <td key={c.key}>{c.render(e)}</td>)}
    </tr>
  );
});

export default function EntityList({ kind, state, selectedId, onOpen, compact = false }) {
  const { t, tv } = useI18n();
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
        { value: 'all', label: t('list.all') }, { value: 'covered', label: t('coverage.covered'), n: n('covered') },
        { value: 'partial', label: t('coverage.partial'), n: n('partial') }, { value: 'uncovered', label: t('coverage.uncovered'), n: n('uncovered') },
      ];
    }
    if (kind === 'testCases') {
      const types = [...new Set(list.map((t) => t.type).filter(Boolean))];
      return [{ value: 'all', label: t('list.allTypes') }, ...types.map((ty) => ({ value: ty, label: tv('testType', ty), n: list.filter((x) => x.type === ty).length }))];
    }
    if (kind === 'gaps') {
      return [
        { value: 'all', label: t('list.all') },
        { value: 'open', label: t('status.gap.open'), n: list.filter(OPEN_GAP).length },
        { value: 'closed', label: t('status.gap.answered'), n: list.filter((g) => !OPEN_GAP(g)).length },
      ];
    }
    return null;
  }, [kind, list, a, t, tv]);

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

  const cols = useMemo(() => columnsFor(kind, a, onOpen, t, tv).filter((c) => !(compact && c.optional)), [kind, a, onOpen, compact, t, tv]);
  const clsCounts = useMemo(() => Object.fromEntries(CLASSES.map((c) => [c, list.filter((e) => e.classification === c).length])), [list]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{t(`nav.${kind}`)} <span className="faint" style={{ fontWeight: 500 }}>{list.length}</span></h1>
          {kind === 'gaps' && <p>{t('list.gapsIntro')}</p>}
          {kind === 'requirements' && <p>{t('list.requirementsIntro')}</p>}
        </div>
      </div>
      <div className="toolbar">
        <input type="search" dir="auto" placeholder={t('list.filter', { kind: t(`nav.${kind}`).toLowerCase() })} value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg value={cls} onChange={setCls} options={[{ value: 'all', label: t('list.all') }, ...CLASSES.filter((c) => clsCounts[c]).map((c) => ({ value: c, label: t(`classification.${c}`), n: clsCounts[c] }))]} />
        {extraOptions && <Seg value={extra} onChange={setExtra} options={extraOptions} />}
        <span className="grow" />
        <span className="faint" style={{ fontSize: 12 }}>{t('list.shown', { count: items.length })}</span>
      </div>

      {kind === 'gaps' ? (
        <GapList items={items} selectedId={selectedId} onOpen={onOpen} feedbackBy={feedbackBy} changed={changed} />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 96 }}>{t('list.col.id')}</th>
                <th>{t(`kind.${kind}`)}</th>
                {cols.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <Row key={e.id} e={e} cols={cols} selected={selectedId === e.id} changed={changed.has(e.id)} fb={feedbackBy[e.id] || 0} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
          {!items.length && <div className="empty"><Icon name="search" /> {t('list.empty')}</div>}
        </div>
      )}
    </div>
  );
}
