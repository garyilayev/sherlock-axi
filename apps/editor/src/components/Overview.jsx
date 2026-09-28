'use client';
import { Icon, Bar, IdChip, LinkedText, Bidi } from './ui.jsx';
import { useI18n } from '../i18n/index.js';

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

function changeText(ch, t) {
  if (ch.type === 'create') return t('overview.changeCreated', { count: ch.added?.length ?? 0 });
  const parts = [
    ch.added?.length && t('overview.changeAdded', { count: ch.added.length }),
    ch.modified?.length && t('overview.changeModified', { count: ch.modified.length }),
    ch.removed?.length && t('overview.changeRemoved', { count: ch.removed.length }),
  ].filter(Boolean);
  return t('overview.changeRevision', { rev: ch.revision, parts: parts.join(', ') || t('overview.changeProject') });
}

export default function Overview({ state, navigate, onOpen }) {
  const { t, tv, fmt } = useI18n();
  const { model, analysis: a, project, prd } = state;
  const c = a.stats.counts;
  const cov = a.coverage.summary;
  const prov = a.provenance;
  const untraced = (kind) => (model[kind] || []).filter((e) => !TRUSTED.has(prov.perEntity[e.id]?.status)).length;
  const traceStatus = (kind) => {
    const n = untraced(kind);
    return n ? { tone: 'warn', status: t('overview.notTraced', { count: n }) } : { tone: 'ok', status: t('overview.allTraced') };
  };
  const breakdownKinds = ['requirements', 'screens', 'flows', 'testCases', 'validations', 'gaps'];
  const changes = (project?.changes ?? []).slice(0, 4);

  return (
    <div className="page">
      <div className="overview-meta">
        <span className={`badge ${a.reviewStatus === 'ready' ? 'ok' : 'warn'}`}>{tv('status.review', a.reviewStatus)}</span>
        <span>{t('overview.revision', { rev: project?.revision ?? 0 })}</span>
        {project?.updatedAt && <span>· {t('overview.updated', { time: fmt.relative(project.updatedAt) })}</span>}
      </div>
      <Bidi as="h1" className="overview-title">{model.project.name}</Bidi>
      {model.project.summary
        ? <LinkedText as="p" className="overview-summary" text={model.project.summary} onOpen={onOpen} />
        : <p className="overview-summary" />}

      <div className="metrics">
        <Metric label={t('nav.requirements')} value={c.requirements} icon="file" iconClass="ic-blue" onClick={() => navigate('requirements')} {...traceStatus('requirements')} />
        <Metric label={t('nav.screens')} value={c.screens} icon="monitor" iconClass="ic-blue" onClick={() => navigate('screens')} {...traceStatus('screens')} />
        <Metric label={t('nav.testCases')} value={c.testCases} icon="checkSquare" iconClass="ic-teal" onClick={() => navigate('testCases')} {...traceStatus('testCases')} />
        <Metric label={t('nav.gaps')} value={c.gaps} icon="warning" iconClass="ic-orange" onClick={() => navigate('gaps')}
          tone={a.openGaps ? 'warn' : 'ok'} status={a.openGaps ? t('overview.needReview') : t('overview.allAnswered')} />
      </div>

      <section className="sec">
        <h3 className="sec-title"><Icon name="message" size={18} />{t('overview.keyFeatures')}</h3>
        <ul className="feature-list">
          {(model.project.keyFeatures || []).map((f, i) => {
            const title = typeof f === 'string' ? f : f.title;
            const ids = typeof f === 'string' ? [] : f.requirementIds || [];
            return (
              <li key={i}>
                <button type="button" onClick={() => ids[0] && onOpen(ids[0])} title={ids.join(', ')}>
                  <Icon name="check" className="check" size={17} />
                  <Bidi className="grow">{title}</Bidi>
                  {ids.length > 0 && <span className="feature-ids">{ids.slice(0, 3).map((id) => <IdChip key={id} id={id} />)}</span>}
                </button>
              </li>
            );
          })}
          {!model.project.keyFeatures?.length && <li className="faint">{t('overview.noKeyFeatures')}</li>}
        </ul>
      </section>

      <section className="sec">
        <h3 className="sec-title"><Icon name="gaps" size={18} />{t('overview.coverageTraceability')}</h3>
        <div className="coverage-strip">
          <button type="button" className="card" onClick={() => navigate('requirements')}>
            <div className="row" style={{ alignItems: 'baseline', marginBottom: 10 }}>
              <span className="big">{cov.percent}%</span>
              <span className="muted" style={{ fontSize: 13 }}>{t('overview.coverageSummary', { covered: cov.covered, total: cov.total })}</span>
            </div>
            <Bar parts={[
              { label: t('coverage.covered'), value: cov.covered, color: 'var(--ok)' },
              { label: t('coverage.partial'), value: cov.partial, color: 'var(--warn)' },
              { label: t('coverage.uncovered'), value: cov.uncovered, color: 'var(--bad)' },
            ]} />
            <div className="legend">
              <span><i style={{ background: 'var(--ok)' }} />{t('coverage.covered')} {cov.covered}</span>
              <span><i style={{ background: 'var(--warn)' }} />{t('coverage.partial')} {cov.partial}</span>
              <span><i style={{ background: 'var(--bad)' }} />{t('coverage.uncovered')} {cov.uncovered}</span>
              <span><i style={{ background: 'var(--ambiguous)' }} />{t('coverage.ambiguous')} {cov.ambiguous}</span>
            </div>
          </button>
          <div className="card">
            <div className="row" style={{ alignItems: 'baseline', marginBottom: 10 }}>
              <span className="big">{prov.traceability}%</span>
              <span className="muted" style={{ fontSize: 13 }}>{t('overview.traceSummary', { verified: prov.verified })}</span>
            </div>
            <Bar parts={[
              { label: t('overview.traced'), value: prov.total - prov.issues.length, color: 'var(--accent)' },
              { label: t('overview.sourceIssues'), value: prov.issues.length, color: 'var(--bad)' },
            ]} />
            <div className="row wrap" style={{ marginTop: 10, gap: 6, fontSize: 12 }}>
              {prov.issues.length ? (
                <>
                  <span className="faint">{t('overview.sourceIssuesLabel')}</span>
                  {prov.issues.slice(0, 8).map((i) => <IdChip key={i.id} id={i.id} onOpen={onOpen} title={tv('source', i.status)} />)}
                </>
              ) : <span className="faint">{t('overview.allSourced')}</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <h3 className="sec-title"><Icon name="clipboard" size={18} />{t('overview.recentUpdates')}</h3>
        <div className="info-box">
          <Icon name="info" size={17} />
          <ul className="grow">
            {changes.length ? changes.map((ch) => (
              <li key={ch.revision}>
                <span>{changeText(ch, t)}</span>
                {ch.note && <> <LinkedText text={ch.note} onOpen={onOpen} /></>}
                {ch.resolves?.length > 0 && <span className="faint"> ({t('overview.resolves', { ids: <bdi dir="ltr">{ch.resolves.join(', ')}</bdi> })})</span>}
                <span className="faint"> · {fmt.relative(ch.at)}</span>
              </li>
            )) : null}
            <li>{t('overview.disclaimer', { doc: <bdi>{prd?.document ?? 'PRD'}</bdi> })}</li>
          </ul>
        </div>
      </section>

      <section className="sec">
        <h3 className="sec-title"><Icon name="checkSquare" size={18} />{t('overview.contentBreakdown')}</h3>
        <div className="breakdown">
          {breakdownKinds.map((k) => {
            const b = a.stats.breakdown[k];
            return (
              <button type="button" key={k} onClick={() => navigate(k)}>
                <Icon name={BREAKDOWN_ICONS[k]} size={18} />
                <div>
                  <div className="bl">{t(`nav.${k}`)}</div>
                  <div className="n">{c[k]}</div>
                </div>
                <div className="kv">
                  {Object.entries(b).filter(([cl, v]) => v || (cl !== 'ambiguous' && k !== 'gaps')).map(([cl, v]) => (
                    <span key={cl}>{tv('classification', cl)}: {v}</span>
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
