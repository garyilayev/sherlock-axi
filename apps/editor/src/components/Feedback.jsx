'use client';
import { useState } from 'react';
import { IdChip, LinkedText } from './ui.jsx';
import { dirOf, timeAgo } from '../lib/meta.js';

const TYPES = [
  { value: 'correction', label: 'Correction' },
  { value: 'missing', label: 'Missing' },
  { value: 'question', label: 'Question' },
  { value: 'remove', label: 'Remove' },
];

const QUICK = {
  testCases: [['correction', 'The expected result is wrong: '], ['missing', 'Add a test for '], ['missing', 'Add a boundary/negative case: ']],
  requirements: [['question', 'Where did this requirement come from?'], ['correction', 'The PRD says '], ['missing', 'Missing test coverage for ']],
  flows: [['missing', 'This flow is missing a step: '], ['correction', 'Step order is wrong: ']],
  project: [['missing', 'The guide is missing '], ['question', 'Why is there no coverage for '], ['correction', 'Across the guide, ']],
  gaps: [['correction', 'Answer: '], ['remove', 'This is not a real gap — the PRD covers it in §']],
  default: [['question', 'Why did Sherlock generate this?'], ['correction', 'This is wrong: '], ['remove', 'Not relevant — remove it.']],
};

const STATUS_TONE = { open: 'warn', resolved: 'ok', dismissed: '' };

export function FeedbackItem({ f, onPatch, onOpen, showTarget }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (body) => {
    setBusy(true);
    try { await onPatch(f.id, body); setReply(''); } finally { setBusy(false); }
  };
  return (
    <div className="msg">
      <div className="who">
        <b>QA</b><span className="mono">{f.id}</span>
        <span className={`badge ${STATUS_TONE[f.status]}`}>{f.status}</span>
        <span className="badge kind">{f.type}</span>
        {showTarget && <IdChip id={f.targetId} onOpen={f.targetId !== 'project' ? onOpen : undefined} />}
        <span className="grow" />
        <span>{timeAgo(f.createdAt)}</span>
      </div>
      <p dir={dirOf(f.message)}>{f.message}</p>
      {f.thread?.length > 0 && (
        <div className="replies">
          {f.thread.map((r, i) => (
            <div key={i} className={`reply ${r.author}`}>
              <div className="who"><b>{r.author === 'claude' ? 'Claude' : 'QA'}</b><span>{timeAgo(r.at)}</span></div>
              <LinkedText as="div" text={r.message} onOpen={onOpen} />
            </div>
          ))}
          {f.resolution?.changedIds?.length > 0 && (
            <div className="row wrap" style={{ gap: 4, fontSize: 12 }}>
              <span className="faint">Changed in rev {f.resolution.revision}:</span>
              {f.resolution.changedIds.slice(0, 10).map((id) => <IdChip key={id} id={id} onOpen={onOpen} />)}
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim()) send({ message: reply }); }}
          placeholder={f.status === 'open' ? 'Add detail…' : 'Reply to reopen…'}
          style={{ flex: 1, height: 28, border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', background: 'var(--surface)', fontSize: 13 }}
        />
        {reply.trim()
          ? <button type="button" className="btn sm" disabled={busy} onClick={() => send({ message: reply })}>{f.status === 'open' ? 'Add' : 'Reopen'}</button>
          : f.status === 'open'
            ? <button type="button" className="btn sm ghost" disabled={busy} onClick={() => send({ status: 'dismissed' })}>Withdraw</button>
            : <button type="button" className="btn sm ghost" disabled={busy} onClick={() => send({ status: 'open' })}>Reopen</button>}
      </div>
    </div>
  );
}

export function FeedbackPanel({ targetId, kind, feedback, onSend, onPatch, onOpen, hideThread = false, placeholder }) {
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
        {quick.map(([t, q]) => (
          <button type="button" key={q} onClick={() => { setType(t); setText(q); }}>{q.replace(/[: ]+$/, '')}</button>
        ))}
      </div>
      <div className="composer">
        <textarea
          value={text}
          dir="auto"
          onChange={(e) => { setText(e.target.value); setSent(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder={placeholder ?? `Feedback for Claude on ${targetId}…`}
          aria-label="Feedback"
        />
        <div className="bar2">
          {TYPES.map((t) => (
            <button type="button" key={t.value} className={`chip-toggle ${type === t.value ? 'on' : ''}`} onClick={() => setType(t.value)}>{t.label}</button>
          ))}
          <span className="grow" />
          <kbd>Ctrl ↵</kbd>
          <button type="button" className="btn primary sm" disabled={!text.trim() || busy} onClick={submit}>Send to Claude</button>
        </div>
      </div>
      {sent && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{sent} saved locally. Claude picks it up with <span className="mono">sherlock feedback</span>.</div>}
    </div>
  );
}

export function FeedbackView({ state, onOpen, onPatch, onSend }) {
  const [filter, setFilter] = useState('open');
  const list = [...(state.feedback || [])].reverse().filter((f) => filter === 'all' || f.status === filter);
  const count = (s) => (state.feedback || []).filter((f) => f.status === s).length;
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Feedback</h1>
          <p>Everything the QA has asked Claude to change or explain. Claude reads this with <span className="mono">sherlock feedback</span>, updates the model, and replies here.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="seg">
          {['open', 'resolved', 'dismissed', 'all'].map((s) => (
            <button type="button" key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
              {s}{s !== 'all' && <span className="n">{count(s)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="card general-feedback" style={{ maxWidth: 820, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>General feedback</div>
        <FeedbackPanel targetId="project" kind="project" feedback={state.feedback} onSend={onSend} onPatch={onPatch} onOpen={onOpen}
          hideThread placeholder="Feedback on the guide as a whole (missing areas, wrong assumptions)…" />
      </div>
      <div className="thread" style={{ maxWidth: 820 }}>
        {list.map((f) => <FeedbackItem key={f.id} f={f} onPatch={onPatch} onOpen={onOpen} showTarget />)}
        {!list.length && <div className="card empty">No {filter === 'all' ? '' : filter} feedback. Select any item and use “Send to Claude”.</div>}
      </div>
    </div>
  );
}
