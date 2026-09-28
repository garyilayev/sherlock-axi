'use client';
import { useState } from 'react';
import { IdChip, LinkedText, Bidi } from './ui.jsx';
import { useI18n } from '../i18n/index.js';

const TYPES = ['correction', 'missing', 'question', 'remove'];

// [feedback type, i18n key under feedback.quick]
const QUICK = {
  testCases: [['correction', 'expectedWrong'], ['missing', 'addTestFor'], ['missing', 'addBoundary']],
  requirements: [['question', 'whereFrom'], ['correction', 'prdSays'], ['missing', 'missingCoverage']],
  flows: [['missing', 'missingStep'], ['correction', 'wrongOrder']],
  project: [['missing', 'guideMissing'], ['question', 'noCoverageFor'], ['correction', 'acrossGuide']],
  gaps: [['correction', 'answer'], ['remove', 'notAGap']],
  default: [['question', 'why'], ['correction', 'wrong'], ['remove', 'irrelevant']],
};

const STATUS_TONE = { open: 'warn', resolved: 'ok', dismissed: '' };

export function FeedbackItem({ f, onPatch, onOpen, showTarget }) {
  const { t, tv, fmt } = useI18n();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (body) => {
    setBusy(true);
    try { await onPatch(f.id, body); setReply(''); } finally { setBusy(false); }
  };
  return (
    <div className="msg">
      <div className="who">
        <b>{t('feedback.qa')}</b><span className="mono" dir="ltr">{f.id}</span>
        <span className={`badge ${STATUS_TONE[f.status]}`}>{tv('status.feedback', f.status)}</span>
        <span className="badge kind">{tv('feedback.type', f.type)}</span>
        {showTarget && <IdChip id={f.targetId} onOpen={f.targetId !== 'project' ? onOpen : undefined} />}
        <span className="grow" />
        <span>{fmt.relative(f.createdAt)}</span>
      </div>
      <Bidi as="p">{f.message}</Bidi>
      {f.thread?.length > 0 && (
        <div className="replies">
          {f.thread.map((r, i) => (
            <div key={i} className={`reply ${r.author}`}>
              <div className="who"><b>{r.author === 'claude' ? t('feedback.claude') : t('feedback.qa')}</b><span>{fmt.relative(r.at)}</span></div>
              <LinkedText as="div" text={r.message} onOpen={onOpen} />
            </div>
          ))}
          {f.resolution?.changedIds?.length > 0 && (
            <div className="row wrap" style={{ gap: 4, fontSize: 12 }}>
              <span className="faint">{t('feedback.changedIn', { rev: f.resolution.revision })}</span>
              {f.resolution.changedIds.slice(0, 10).map((id) => <IdChip key={id} id={id} onOpen={onOpen} />)}
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <input
          value={reply}
          dir="auto"
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim()) send({ message: reply }); }}
          placeholder={f.status === 'open' ? t('feedback.addDetail') : t('feedback.replyToReopen')}
          style={{ flex: 1, height: 28, border: '1px solid var(--border)', borderRadius: 6, paddingInline: 8, background: 'var(--surface)', fontSize: 13 }}
        />
        {reply.trim()
          ? <button type="button" className="btn sm" disabled={busy} onClick={() => send({ message: reply })}>{f.status === 'open' ? t('feedback.add') : t('feedback.reopen')}</button>
          : f.status === 'open'
            ? <button type="button" className="btn sm ghost" disabled={busy} onClick={() => send({ status: 'dismissed' })}>{t('feedback.withdraw')}</button>
            : <button type="button" className="btn sm ghost" disabled={busy} onClick={() => send({ status: 'open' })}>{t('feedback.reopen')}</button>}
      </div>
    </div>
  );
}

export function FeedbackPanel({ targetId, kind, feedback, onSend, onPatch, onOpen, hideThread = false, placeholder }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [type, setType] = useState('correction');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const items = (feedback || []).filter((f) => f.targetId === targetId);
  const quick = QUICK[kind] || QUICK.default;

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const fb = await onSend({ targetId, message: text.trim(), type });
      setText('');
      setSent(fb.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!hideThread && items.length > 0 && (
        <div className="thread">
          {items.map((f) => <FeedbackItem key={f.id} f={f} onPatch={onPatch} onOpen={onOpen} />)}
        </div>
      )}
      <div className="quick">
        {quick.map(([ty, key]) => {
          const q = t(`feedback.quick.${key}`);
          return <button type="button" key={key} onClick={() => { setType(ty); setText(q); }}>{q.replace(/[:§ ]+$/, '')}</button>;
        })}
      </div>
      <div className="composer">
        <textarea
          value={text}
          dir="auto"
          onChange={(e) => { setText(e.target.value); setSent(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder={placeholder ?? t('feedback.placeholder', { id: targetId })}
          aria-label={t('inspector.feedback')}
        />
        <div className="bar2">
          {TYPES.map((ty) => (
            <button type="button" key={ty} className={`chip-toggle ${type === ty ? 'on' : ''}`} onClick={() => setType(ty)}>{t(`feedback.type.${ty}`)}</button>
          ))}
          <span className="grow" />
          <kbd dir="ltr">Ctrl ↵</kbd>
          <button type="button" className="btn primary sm" disabled={!text.trim() || busy} onClick={submit}>{t('feedback.send')}</button>
        </div>
      </div>
      {sent && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{t('feedback.saved', { id: sent, cmd: <span className="mono" dir="ltr">sherlock feedback</span> })}</div>}
    </div>
  );
}

export function FeedbackView({ state, onOpen, onPatch, onSend }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('open');
  const list = [...(state.feedback || [])].reverse().filter((f) => filter === 'all' || f.status === filter);
  const count = (s) => (state.feedback || []).filter((f) => f.status === s).length;
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{t('feedback.title')}</h1>
          <p>{t('feedback.intro', { cmd: <span className="mono" dir="ltr">sherlock feedback</span> })}</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="seg">
          {['open', 'resolved', 'dismissed', 'all'].map((s) => (
            <button type="button" key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
              {t(`status.feedback.${s}`)}{s !== 'all' && <span className="n">{count(s)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="card general-feedback" style={{ maxWidth: 820, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('feedback.general')}</div>
        <FeedbackPanel targetId="project" kind="project" feedback={state.feedback} onSend={onSend} onPatch={onPatch} onOpen={onOpen}
          hideThread placeholder={t('feedback.generalPlaceholder')} />
      </div>
      <div className="thread" style={{ maxWidth: 820 }}>
        {list.map((f) => <FeedbackItem key={f.id} f={f} onPatch={onPatch} onOpen={onOpen} showTarget />)}
        {!list.length && (
          <div className="card empty">
            {filter === 'all' ? t('feedback.emptyAll') : t('feedback.empty', { status: t(`status.feedback.${filter}`).toLowerCase() })}
          </div>
        )}
      </div>
    </div>
  );
}
