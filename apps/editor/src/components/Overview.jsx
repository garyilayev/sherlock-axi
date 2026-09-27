'use client';
import { Icon, Bar, IdChip, LinkedText } from './ui.jsx';
import { KINDS, dirOf, timeAgo } from '../lib/meta.js';

const TRUSTED = new Set(['verified', 'paraphrased', 'section-only', 'inherited']);
const BREAKDOWN_ICONS = { requirements: 'file', screens: 'monitor', flows: 'flowNodes', testCases: 'checkSquare', validations: 'gaps', gaps: 'warning' };

function Metric({ label, value, icon, iconClass, tone, status, onClick }) {
  return (
    <button type="button" className="metric" onClick={onClick}>
      <div className="label">{label}</div>
      <Icon name={icon} size={22} className={`m-icon ${iconClass}`} />
      <div className="value">{value}</div>
      <div className={`status tone-${tone}`}><span className="status-dot" />{status}</div>
    </button>
  );
}

function changeText(ch) {
  if (ch.type === 'create') return `Guide generated from the PRD with ${ch.added?.length ?? 0} items.`;
  const parts = [
    ch.added?.length && `${ch.added.length} added`,
    ch.modified?.length && `${ch.modified.length} modified`,
    ch.removed?.length && `${ch.removed.length} removed`,
  ].filter(Boolean);
  return `Revision ${ch.revision}: ${parts.join(', ') || 'project details updated'}.`;
}

export default function Overview({ state, navigate, onOpen }) {
  const { model, analysis: a, project, prd } = state;
  const c = a.stats.counts;
  const cov = a.coverage.summary;
  const prov = a.provenance;
  const untraced = (kind) => (model[kind] || []).filter((e) => !TRUSTED.has(prov.perEntity[e.id]?.status)).length;
  const traceStatus = (kind) => {
    const n = untraced(kind);
    return n ? { tone: 'warn', status: `${n} not traced` } : { tone: 'ok', status: 'All traced' };
  };
  const breakdownKinds = ['requirements', 'screens', 'flows', 'testCases', 'validations', 'gaps'];
  const changes = (project?.changes ?? []).slice(0, 4);

  return (
    <div className="page">
      <div className="overview-meta">
        <span className={`badge ${a.reviewStatus === 'ready' ? 'ok' : 'warn'}`}>{a.reviewStatus === 'ready' ? 'Ready' : 'Needs review'}</span>
        <span>Revision {project?.revision ?? 0}</span>
        {project?.updatedAt && <span>· updated {timeAgo(project.updatedAt)}</span>}
      </div>
      <h1 className="overview-title" dir={dirOf(model.project.name)}>{model.project.name}</h1>
      {model.project.summary
        ? <LinkedText as="p" className="overview-summary" text={model.project.summary} onOpen={onOpen} />
        : <p className="overview-summary" />}

      <div className="metrics">
        <Metric label="Requirements" value={c.requirements} icon="file" iconClass="ic-blue" onClick={() => navigate('requirements')} {...traceStatus('requirements')} />
        <Metric label="Screens" value={c.screens} icon="monitor" iconClass="ic-blue" onClick={() => navigate('screens')} {...traceStatus('screens')} />
        <Metric label="Test Cases" value={c.testCases} icon="checkSquare" iconClass="ic-teal" onClick={() => navigate('testCases')} {...traceStatus('testCases')} />
        <Metric label="Gaps" value={c.gaps} icon="warning" iconClass="ic-orange" onClick={() => navigate('gaps')}
          tone={a.openGaps ? 'warn' : 'ok'} status={a.openGaps ? 'Need review' : 'All answered'} />
      </div>

      <section className="sec">
        <h3 className="sec-title"><Icon name="message" size={18} />Key Features</h3>
        <ul className="feature-list">
          {(model.project.keyFeatures || []).map((f, i) => {
            const title = typeof f === 'string' ? f : f.title;
            const ids = typeof f === 'string' ? [] : f.requirementIds || [];
            return (
              <li key={i}>
                <button type="button" onClick={() => ids[0] && onOpen(ids[0])} title={ids.join(', ')}>
                  <Icon name="check" className="check" size={17} />
                  <span className="grow" dir={dirOf(title)}>{title}</span>
                </button>
              </li>
            );
          })}
          {!model.project.keyFeatures?.length && <li className="faint">No key features listed.</li>}
        </ul>
      </section>

      <section className="sec">
        <h3 className="sec-title"><Icon name="gaps" size={18} />Coverage & Traceability</h3>
        <div className="coverage-strip">
          <button type="button" className="card" style={{ textAlign: 'left' }} onClick={() => navigate('requirements')}>
            <div className="row" style={{ alignItems: 'baseline', marginBottom: 10 }}>
              <span className="big">{cov.percent}%</span>
              <span className="muted" style={{ fontSize: 13 }}>{cov.covered} of {cov.total} requirements fully covered</span>
            </div>
            <Bar parts={[
              { label: 'Covered', value: cov.covered, color: 'var(--ok)' },
              { label: 'Partial', value: cov.partial, color: 'var(--warn)' },
              { label: 'Uncovered', value: cov.uncovered, color: 'var(--bad)' },
            ]} />
            <div className="legend">
              <span><i style={{ background: 'var(--ok)' }} />Covered {cov.covered}</span>
              <span><i style={{ background: 'var(--warn)' }} />Partial {cov.partial}</span>
              <span><i style={{ background: 'var(--bad)' }} />Uncovered {cov.uncovered}</span>
              <span><i style={{ background: 'var(--ambiguous)' }} />Ambiguous {cov.ambiguous}</span>
            </div>
          </button>
          <div className="card">
            <div className="row" style={{ alignItems: 'baseline', marginBottom: 10 }}>
              <span className="big">{prov.traceability}%</span>
              <span className="muted" style={{ fontSize: 13 }}>traced to the PRD · {prov.verified} quotes verified verbatim</span>
            </div>
            <Bar parts={[
              { label: 'Traced', value: prov.total - prov.issues.length, color: 'var(--accent)' },
              { label: 'Source issues', value: prov.issues.length, color: 'var(--bad)' },
            ]} />
            <div className="row wrap" style={{ marginTop: 10, gap: 6, fontSize: 12 }}>
              {prov.issues.length ? (
                <>
                  <span className="faint">Source issues:</span>
                  {prov.issues.slice(0, 8).map((i) => <IdChip key={i.id} id={i.id} onOpen={onOpen} title={i.status} />)}
                </>
              ) : <span className="faint">Every item cites a PRD section or a linked item.</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <h3 className="sec-title"><Icon name="clipboard" size={18} />Recent Updates</h3>
        <div className="info-box">
          <Icon name="info" size={17} />
          <ul className="grow">
            {changes.length ? changes.map((ch) => (
              <li key={ch.revision}>
                <span>{changeText(ch)}</span>
                {ch.note && <> <LinkedText text={ch.note} onOpen={onOpen} /></>}
                {ch.resolves?.length > 0 && <span className="faint"> (resolves {ch.resolves.join(', ')})</span>}
                <span className="faint"> · {timeAgo(ch.at)}</span>
              </li>
            )) : null}
            <li>
              This QA guide was generated from {prd?.document ?? 'the PRD'} and includes both explicit requirements and inferred QA elements.
              Review the classifications to understand the source and confidence level of each item.
            </li>
          </ul>
        </div>
      </section>

      <section className="sec">
        <h3 className="sec-title"><Icon name="checkSquare" size={18} />Content Breakdown</h3>
        <div className="breakdown">
          {breakdownKinds.map((k) => {
            const b = a.stats.breakdown[k];
            return (
              <button type="button" key={k} onClick={() => navigate(k)}>
                <Icon name={BREAKDOWN_ICONS[k]} size={18} />
                <div>
                  <div className="bl">{KINDS[k].label}</div>
                  <div className="n">{c[k]}</div>
                </div>
                <div className="kv">
                  {Object.entries(b).filter(([cl, v]) => v || (cl !== 'ambiguous' && k !== 'gaps')).map(([cl, v]) => (
                    <span key={cl}>{cl}: {v}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
