'use client';
import { Fragment, useMemo } from 'react';
import { Icon, ClassBadge, KindBadge, CoverageBadge, SourceBadge, IdChip, LinkedText } from './ui.jsx';
import { FeedbackPanel } from './Feedback.jsx';
import { KINDS, CLASS_HELP, kindOfId, titleOf, dirOf } from '../lib/meta.js';

const HEAD_ICON = { flows: 'flowNodes', requirements: 'file', screens: 'monitor', testCases: 'checkSquare', gaps: 'warning' };
const KNOWN = new Set([
  'id', 'title', 'question', 'description', 'classification', 'source', 'relationships', 'notes', 'rationale',
  'steps', 'preconditions', 'expectedResult', 'type', 'priority', 'status', 'impact', 'answer', 'suggestedAnswer',
  'options', 'elements', 'fields', 'states', 'transitions', 'role', 'allowed', 'denied', 'rule', 'field',
  'errorMessage', 'testData', 'gapType',
]);

function stepParts(s) {
  if (typeof s === 'string') return { title: s };
  return {
    title: s.title ?? s.action ?? s.text ?? s.step ?? '',
    detail: s.detail ?? s.description ?? s.expected ?? s.result ?? null,
    refs: [s.screenId, s.actionId, ...(s.ids || [])].filter(Boolean),
  };
}

function Steps({ steps, onOpen }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => {
        const p = stepParts(s);
        return (
          <li key={i} dir={dirOf(`${p.title} ${p.detail ?? ''}`)}>
            <span className="num">{i + 1}</span>
            <div>
              <LinkedText as="div" className="st" text={p.title} onOpen={onOpen} />
              {p.detail && <LinkedText as="div" className="sd" text={p.detail} onOpen={onOpen} />}
              {p.refs?.length > 0 && <div className="meta">{p.refs.map((r) => <IdChip key={r} id={r} onOpen={onOpen} />)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, icon, extra, children }) {
  return (
    <section className="insp-section">
      <h4>{icon && <Icon name={icon} size={17} />}{title}{extra && <span className="faint">{extra}</span>}</h4>
      {children}
    </section>
  );
}

function List({ items, onOpen }) {
  return (
    <ul className="plain-list">
      {items.map((x, i) => (
        <li key={i}>
          {typeof x === 'string'
            ? <LinkedText text={x} onOpen={onOpen} />
            : <LinkedText text={[x.name ?? x.title ?? x.label, x.type && `(${x.type})`, x.notes ?? x.description].filter(Boolean).join(' — ')} onOpen={onOpen} />}
        </li>
      ))}
    </ul>
  );
}

function RelList({ ids, byId, onOpen }) {
  return (
    <div className="rel-list">
      {ids.map((id) => (
        <button type="button" key={id} className="rel-item" onClick={() => onOpen(id)}>
          <span className="rid">{id}</span>
          <span className="t" dir={dirOf(titleOf(byId.get(id)?.e))}>{titleOf(byId.get(id)?.e)}</span>
          <Icon name="chevronRight" size={14} className="chev" />
        </button>
      ))}
    </div>
  );
}

function KindDetails({ kind, e, onOpen }) {
  const out = [];
  if (kind === 'flows' && e.steps?.length) out.push(<Section key="steps" title="Flow Steps"><Steps steps={e.steps} onOpen={onOpen} /></Section>);
  if (kind === 'testCases') {
    if (e.preconditions?.length) out.push(<Section key="pre" title="Preconditions"><List items={e.preconditions} onOpen={onOpen} /></Section>);
    if (e.testData) out.push(<Section key="data" title="Test Data"><LinkedText as="p" text={typeof e.testData === 'string' ? e.testData : JSON.stringify(e.testData)} onOpen={onOpen} /></Section>);
    if (e.steps?.length) out.push(<Section key="steps" title="Test Steps"><Steps steps={e.steps} onOpen={onOpen} /></Section>);
    if (e.expectedResult) out.push(<Section key="exp" title="Expected Result"><LinkedText as="div" className="expected" text={e.expectedResult} onOpen={onOpen} /></Section>);
  }
  if (kind !== 'flows' && kind !== 'testCases' && e.steps?.length) out.push(<Section key="steps" title="Steps"><Steps steps={e.steps} onOpen={onOpen} /></Section>);
  const elements = e.elements ?? e.fields;
  if (elements?.length) out.push(<Section key="el" title={kind === 'screens' ? 'Elements' : 'Fields'}><List items={elements} onOpen={onOpen} /></Section>);
  if (Array.isArray(e.states) && e.states.length) {
    out.push(<Section key="st" title="States"><div className="row wrap" style={{ gap: 6 }}>{e.states.map((s, i) => <span key={i} className="badge plain">{typeof s === 'string' ? s : s.name}</span>)}</div></Section>);
  }
  if (e.transitions?.length) {
    out.push(
      <Section key="tr" title="Transitions">
        <dl className="kv-grid">
          {e.transitions.map((t, i) => (
            <Fragment key={i}>
              <dt className="nowrap">{t.from} → {t.to}</dt>
              <dd><LinkedText text={t.trigger ?? t.action ?? ''} onOpen={onOpen} /></dd>
            </Fragment>
          ))}
        </dl>
      </Section>,
    );
  }
  const rule = [e.field && ['Field', e.field], e.rule && ['Rule', e.rule], e.errorMessage && ['Error message', e.errorMessage], e.role && ['Role', e.role]].filter(Boolean);
  if (rule.length) {
    out.push(
      <Section key="rule" title="Definition">
        <dl className="kv-grid">{rule.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd><LinkedText text={v} onOpen={onOpen} /></dd></Fragment>)}</dl>
      </Section>,
    );
  }
  if (e.allowed?.length || e.denied?.length) {
    out.push(
      <Section key="perm" title="Access">
        {e.allowed?.length > 0 && <><div className="faint" style={{ fontSize: 12 }}>Allowed</div><List items={e.allowed} onOpen={onOpen} /></>}
        {e.denied?.length > 0 && <><div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Denied</div><List items={e.denied} onOpen={onOpen} /></>}
      </Section>,
    );
  }
  if (kind === 'gaps') {
    if (e.question && e.title) out.push(<Section key="q" title="Question"><LinkedText as="p" text={e.question} onOpen={onOpen} /></Section>);
    if (e.impact) out.push(<Section key="imp" title="Why it matters"><LinkedText as="p" text={e.impact} onOpen={onOpen} /></Section>);
    if (e.options?.length) out.push(<Section key="opt" title="Possible answers"><List items={e.options} onOpen={onOpen} /></Section>);
    if (e.suggestedAnswer) out.push(<Section key="sug" title="Suggested default"><LinkedText as="p" text={e.suggestedAnswer} onOpen={onOpen} /></Section>);
    if (e.answer) out.push(<Section key="ans" title="Answer"><LinkedText as="div" className="expected" text={e.answer} onOpen={onOpen} /></Section>);
  }
  // Anything else Claude added — shown generically so nothing is hidden.
  const rest = Object.entries(e).filter(([k, v]) => !KNOWN.has(k) && !/Ids?$/.test(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (rest.length) {
    out.push(
      <Section key="more" title="Details">
        <dl className="kv-grid">
          {rest.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
              <dd>{Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </Fragment>
          ))}
        </dl>
      </Section>,
    );
  }
  return out;
}

function Trace({ id, links, byId, sectionId, onOpen, openPrd }) {
  const l = links[id] || { out: [], in: [] };
  const parents = l.out.filter((x) => kindOfId(x.id) === 'requirements').map((x) => x.id);
  const children = l.in.map((x) => x.id);
  const node = (nid, self) => (
    <div className={`node ${self ? 'self' : ''}`} key={nid}>
      <IdChip id={nid} onOpen={self ? undefined : onOpen} />
      <span dir={dirOf(titleOf(byId.get(nid)?.e))}>{titleOf(byId.get(nid)?.e)}</span>
    </div>
  );
  const selfTree = (
    <>
      {node(id, true)}
      {children.length > 0 && <div className="children">{children.slice(0, 20).map((c) => node(c))}{children.length > 20 && <div className="faint">+{children.length - 20} more</div>}</div>}
    </>
  );
  return (
    <div className="trace">
      {sectionId && (
        <div className="node">
          <button type="button" className="id-chip" onClick={() => openPrd(sectionId)}>§{sectionId}</button>
          <span className="muted">PRD</span>
        </div>
      )}
      <div className={sectionId ? 'children' : ''}>
        {parents.length ? parents.map((p) => (
          <Fragment key={p}>{node(p)}<div className="children">{selfTree}</div></Fragment>
        )) : selfTree}
      </div>
    </div>
  );
}

export default function Inspector({ id, state, byId, onOpen, onClose, openPrd, sendFeedback, patchFeedback }) {
  const hit = byId.get(id);
  const { analysis: a, prd, project, feedback } = state;
  const related = useMemo(() => {
    const l = a.links[id] || { out: [], in: [] };
    const ids = [...new Set([...l.out, ...l.in].map((x) => x.id))];
    const groups = {};
    for (const rid of ids) (groups[kindOfId(rid)] ??= []).push(rid);
    for (const k of Object.keys(groups)) groups[k].sort();
    return groups;
  }, [a, id]);

  if (!hit) {
    return (
      <aside className="pane inspector">
        <div className="insp-head"><div className="top"><h2>{id}</h2><button type="button" className="close" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div></div>
        <div className="insp-body"><p className="muted">This item no longer exists in the model (it may have been removed in the latest revision).</p></div>
      </aside>
    );
  }
  const { kind, e } = hit;
  const v = a.provenance.perEntity[id] || { status: 'missing' };
  const cov = a.coverage.perRequirement[id];
  const sectionId = v.sectionId ?? null;
  const section = sectionId && prd?.sections?.find((s) => s.id === sectionId);
  const lc = project?.lastChange;
  const changed = lc && lc.type !== 'create' && [...(lc.added || []), ...(lc.modified || [])].includes(id);
  const reqs = kind === 'requirements' ? [] : related.requirements || [];
  const otherGroups = Object.entries(related).filter(([k]) => kind === 'requirements' || k !== 'requirements');
  const notes = e.notes ?? e.rationale;

  return (
    <aside className="pane inspector" aria-label={`${id} details`}>
      <div className="insp-head">
        <div className="top">
          <Icon name={HEAD_ICON[kind] ?? kind} size={26} />
          <h2 dir={dirOf(titleOf(e))}>{titleOf(e)}</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close inspector"><Icon name="close" size={18} /></button>
        </div>
        <div className="badges">
          <KindBadge kind={kind} />
          <ClassBadge value={e.classification} />
          {cov && <CoverageBadge status={cov.status} />}
          {e.type && kind === 'testCases' && <span className="badge plain">{e.type}</span>}
          {e.priority && <span className="badge plain">{e.priority}</span>}
          {kind === 'gaps' && <span className={`badge ${['resolved', 'answered', 'closed'].includes(e.status) ? 'ok' : 'warn'}`}>{e.status ?? 'open'}</span>}
          {changed && <span className="badge new">updated rev {lc.revision}</span>}
          <span className="id-chip">{id}</span>
        </div>
      </div>

      <div className="insp-body">
        {e.description && <LinkedText as="p" className="insp-desc" text={e.description} onOpen={onOpen} />}

        <KindDetails kind={kind} e={e} onOpen={onOpen} />

        {cov && (
          <Section title="Coverage">
            <div className={`coverage-box ${cov.status}`}>
              <CoverageBadge status={cov.status} />
              <span>
                {cov.tests.length} test{cov.tests.length === 1 ? '' : 's'}
                {cov.untestedChecks.length > 0 && <> · untested: {cov.untestedChecks.map((c) => <IdChip key={c} id={c} onOpen={onOpen} />)}</>}
                {cov.openGaps.length > 0 && <> · open gap: {cov.openGaps.map((g) => <IdChip key={g} id={g} onOpen={onOpen} />)}</>}
              </span>
            </div>
            {cov.tests.length > 0 && <div style={{ marginTop: 10 }}><RelList ids={cov.tests} byId={byId} onOpen={onOpen} /></div>}
          </Section>
        )}

        {reqs.length > 0 && (
          <Section title="Related Requirements" icon="link">
            <RelList ids={reqs} byId={byId} onOpen={onOpen} />
          </Section>
        )}

        {otherGroups.length > 0 && (
          <Section title={kind === 'requirements' ? 'Related Items' : 'Related'} icon={reqs.length ? undefined : 'link'}>
            {otherGroups.filter(([k]) => !(cov && k === 'testCases')).map(([k, ids]) => (
              <div className="rel-group" key={k}>
                <div className="gl">{KINDS[k]?.label}</div>
                <RelList ids={ids} byId={byId} onOpen={onOpen} />
              </div>
            ))}
          </Section>
        )}

        <Section title="Source" icon="file" extra={<SourceBadge status={v.status} />}>
          <div className="source-block">
            <Icon name="file" size={20} />
            <div className="grow">
              <div className="doc">{e.source?.document ?? prd?.document ?? 'PRD'}</div>
              {section ? (
                <div className="loc">
                  <button type="button" className="id-chip" onClick={() => openPrd(section.id)}>Section {section.id}</button>
                  {' '}<span dir={dirOf(section.heading)}>{section.heading}</span>
                </div>
              ) : e.source?.section ? <div className="loc">Section {e.source.section}</div> : null}
              {v.status === 'inherited' && <div className="loc">Traced via <IdChip id={v.via} onOpen={onOpen} /></div>}
              {v.status === 'section-mismatch' && <div className="loc tone-warn">Quote found in §{v.foundIn}, not §{e.source?.section}</div>}
              {v.status === 'missing' && <div className="loc tone-bad">No PRD source — ask Claude where this came from.</div>}
            </div>
          </div>
          {e.source?.excerpt && <blockquote className="source-quote" dir={dirOf(e.source.excerpt)}>{e.source.excerpt}</blockquote>}
          {section && (
            <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => openPrd(section.id, e.source?.excerpt)}>
              View in PRD <Icon name="chevronRight" size={13} />
            </button>
          )}
          <div className="info-box notes-box">
            <Icon name="message" size={16} />
            <div>
              <div className="nt">Notes</div>
              {notes ? <LinkedText as="div" text={notes} onOpen={onOpen} /> : null}
              <div className={notes ? 'faint' : ''} style={notes ? { marginTop: 4, fontSize: 12 } : undefined}>
                <b style={{ textTransform: 'capitalize' }}>{e.classification ?? 'Unclassified'}</b>: {CLASS_HELP[e.classification] ?? 'No classification set.'}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Traceability" icon="flows">
          <Trace id={id} links={a.links} byId={byId} sectionId={sectionId} onOpen={onOpen} openPrd={openPrd} />
        </Section>

        <Section title="Feedback" icon="message">
          <FeedbackPanel targetId={id} kind={kind} feedback={feedback} onSend={sendFeedback} onPatch={patchFeedback} onOpen={onOpen} />
        </Section>
      </div>
    </aside>
  );
}
