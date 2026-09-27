// Feedback threads. Stored in .sherlock/feedback.json as a plain array:
// { id, targetId, targetTitle, type, message, status, createdAt, updatedAt,
//   revision, thread: [{ author, message, at }], resolution? }

import { entities, titleOf } from '@sherlock/qa-model';

export const FEEDBACK_TYPES = ['correction', 'missing', 'question', 'remove', 'other'];
export const FEEDBACK_STATUS = ['open', 'resolved', 'dismissed'];

export function nextFeedbackId(list) {
  const max = list.reduce((m, f) => Math.max(m, Number(String(f.id).split('-')[1]) || 0), 0);
  return `FB-${String(max + 1).padStart(3, '0')}`;
}

export function newFeedback(list, { targetId, message, type, revision, model }) {
  const now = new Date().toISOString();
  let targetTitle = targetId === 'project' ? model?.project?.name ?? 'Project' : null;
  if (model && !targetTitle) {
    for (const [, e] of entities(model)) if (e.id === targetId) { targetTitle = titleOf(e); break; }
  }
  return {
    id: nextFeedbackId(list),
    targetId,
    targetTitle,
    type: FEEDBACK_TYPES.includes(type) ? type : 'other',
    message: String(message).trim(),
    status: 'open',
    author: 'qa',
    createdAt: now,
    updatedAt: now,
    revision: revision ?? null,
    thread: [],
  };
}

/** Apply a status change and/or a reply. QA replies reopen resolved items. */
export function updateFeedback(fb, { status, message, author = 'qa', changedIds, revision }) {
  const now = new Date().toISOString();
  const next = { ...fb, thread: [...(fb.thread || [])], updatedAt: now };
  if (message) next.thread.push({ author, message: String(message).trim(), at: now });
  if (status && FEEDBACK_STATUS.includes(status)) next.status = status;
  else if (message && author === 'qa' && fb.status !== 'open') next.status = 'open';
  if (author === 'claude' && next.status !== 'open') {
    next.resolution = { note: message ?? null, changedIds: changedIds ?? [], revision: revision ?? null, at: now };
  }
  return next;
}
