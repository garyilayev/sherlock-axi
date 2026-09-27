// Incremental edits so Claude can apply feedback without rewriting the model.
//
// Patch format:
// {
//   "upsert": [ { "id": "TC-024", ...full entity } ],   // add or replace
//   "merge":  [ { "id": "TC-023", "expectedResult": "..." } ], // shallow field merge
//   "remove": [ "TC-019" ],                               // delete + strip references
//   "project": { "summary": "..." }                        // shallow merge into project
// }

import { KIND_KEYS, kindOfId, entities } from './schema.js';

export function isPatch(doc) {
  return !!doc && typeof doc === 'object' && ['upsert', 'merge', 'remove'].some((k) => k in doc) && !('requirements' in doc);
}

const clone = (x) => structuredClone(x);

function stripRefs(value, removed) {
  if (Array.isArray(value)) {
    return value
      .filter((v) => !(typeof v === 'string' && removed.has(v)))
      .filter((v) => !(v && typeof v === 'object' && typeof v.target === 'string' && removed.has(v.target)))
      .map((v) => stripRefs(v, removed));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'source' ? v : stripRefs(v, removed);
    return out;
  }
  return value;
}

export function applyPatch(model, patch) {
  const next = clone(model);
  const problems = [];
  for (const k of KIND_KEYS) next[k] ??= [];

  const locate = (id) => {
    const kind = kindOfId(id);
    if (!kind) return [null, -1];
    return [kind, next[kind].findIndex((e) => e.id === id)];
  };

  for (const e of patch.upsert || []) {
    const [kind, idx] = locate(e?.id);
    if (!kind) { problems.push({ code: 'PATCH_BAD_ID', id: e?.id ?? null, message: 'upsert needs a valid id' }); continue; }
    if (idx >= 0) next[kind][idx] = e; else next[kind].push(e);
  }
  for (const e of patch.merge || []) {
    const [kind, idx] = locate(e?.id);
    if (!kind || idx < 0) { problems.push({ code: 'PATCH_NOT_FOUND', id: e?.id ?? null, message: 'merge target does not exist' }); continue; }
    next[kind][idx] = { ...next[kind][idx], ...e };
  }
  const removed = new Set();
  for (const id of patch.remove || []) {
    const [kind, idx] = locate(id);
    if (!kind || idx < 0) { problems.push({ code: 'PATCH_NOT_FOUND', id, message: 'remove target does not exist' }); continue; }
    next[kind].splice(idx, 1);
    removed.add(id);
  }
  if (removed.size) {
    for (const k of KIND_KEYS) next[k] = next[k].map((e) => stripRefs(e, removed));
    if (next.project?.keyFeatures) next.project = stripRefs(next.project, removed);
  }
  if (patch.project) next.project = { ...next.project, ...patch.project };
  return { model: next, problems };
}

/** ID-level diff between two model revisions. */
export function diffModels(prev, next) {
  const a = new Map([...entities(prev || {})].map(([, e]) => [e.id, JSON.stringify(e)]));
  const b = new Map([...entities(next || {})].map(([, e]) => [e.id, JSON.stringify(e)]));
  const added = [...b.keys()].filter((id) => !a.has(id));
  const removed = [...a.keys()].filter((id) => !b.has(id));
  const modified = [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id));
  const projectChanged = JSON.stringify(prev?.project) !== JSON.stringify(next?.project);
  return { added, modified, removed, projectChanged };
}
