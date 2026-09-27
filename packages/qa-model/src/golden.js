// Golden-fixture evaluation: does a generated model cover the QA knowledge a
// human QA guide covers? Used for Sherlock regression tests (`sherlock eval`).
import { entities, KIND_KEYS } from './schema.js';

const flat = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(flat).join(' ')
  : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => k !== 'source').map(([, x]) => flat(x)).join(' ') : '');
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ');

export function evaluateGolden(model, golden) {
  const docs = [...entities(model)].map(([kind, e]) => ({ id: e.id, kind, text: norm(flat(e)) }));
  const projectText = norm(flat(model.project || {}));
  const concepts = golden.concepts.map((c) => {
    if (c.kinds) {
      const n = c.kinds.reduce((sum, k) => sum + (model[k]?.length ?? 0), 0);
      return { id: c.id, label: c.label, hit: n >= (c.minCount ?? 1), matchedIds: [], note: `${n} ${c.kinds.join('+')}` };
    }
    const groups = c.any.map((g) => g.map(norm));
    const matchedIds = docs.filter((d) => groups.some((g) => g.every((t) => d.text.includes(t)))).map((d) => d.id);
    const inProject = !matchedIds.length && groups.some((g) => g.every((t) => projectText.includes(t)));
    return { id: c.id, label: c.label, hit: matchedIds.length > 0 || inProject, matchedIds: matchedIds.slice(0, 8) };
  });
  const hits = concepts.filter((c) => c.hit).length;
  const recall = concepts.length ? hits / concepts.length : 0;
  const counts = Object.fromEntries(KIND_KEYS.map((k) => [k, model[k]?.length ?? 0]));
  return { recall, hits, total: concepts.length, pass: recall >= (golden.threshold ?? 0.85), concepts, counts };
}
