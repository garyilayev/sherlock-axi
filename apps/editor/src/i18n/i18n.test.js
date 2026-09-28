import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createT, createFormatters, detectLang, interpolate, prdLooksHebrew } from './core.js';

const load = (lang) => JSON.parse(fs.readFileSync(new URL(`./${lang}.json`, import.meta.url), 'utf8'));
const en = load('en');
const he = load('he');
const dicts = { en, he };
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (v) => v && typeof v === 'object' && typeof v.other === 'string' && Object.keys(v).every((k) => PLURAL_FORMS.has(k));

/** Leaf keys; a plural object counts as one leaf (its forms may differ per language). */
function leaves(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlural(v)) out.set(key, Object.values(v));
    else if (v && typeof v === 'object') leaves(v, key, out);
    else out.set(key, [v]);
  }
  return out;
}

const placeholders = (strings) => [...new Set(strings.flatMap((s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1])).filter((p) => p !== 'count'))].sort();

test('en and he have exactly the same keys (recursively, plural objects included)', () => {
  const a = [...leaves(en).keys()].sort();
  const b = [...leaves(he).keys()].sort();
  assert.deepEqual(a.filter((k) => !b.includes(k)), [], 'missing in he.json');
  assert.deepEqual(b.filter((k) => !a.includes(k)), [], 'missing in en.json');
  for (const [key, v] of leaves(en)) {
    const h = leaves(he).get(key);
    assert.equal(typeof v[0], typeof h[0], `${key}: type differs`);
  }
});

test('plural objects have an "other" form in both languages', () => {
  const walk = (o, key = '') => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && ('one' in v || 'other' in v)) assert.ok(typeof v.other === 'string', `${key}${k} lacks "other"`);
      else if (v && typeof v === 'object') walk(v, `${key}${k}.`);
    }
  };
  walk(en);
  walk(he);
});

test('every key uses the same {placeholders} in both languages', () => {
  const H = leaves(he);
  for (const [key, v] of leaves(en)) assert.deepEqual(placeholders(H.get(key)), placeholders(v), key);
});

test('no empty values', () => {
  for (const [name, d] of Object.entries(dicts)) {
    for (const [key, v] of leaves(d)) for (const s of v) assert.ok(String(s).trim(), `${name}:${key} is empty`);
  }
});

test('plurals pick the right form for 1, 2 and 5', () => {
  const tEn = createT('en', dicts);
  const tHe = createT('he', dicts);
  assert.equal(tEn('search.results', { count: 1 }), '1 result');
  assert.equal(tEn('search.results', { count: 2 }), '2 results');
  assert.equal(tEn('search.results', { count: 5 }), '5 results');
  assert.equal(tHe('search.results', { count: 1 }), 'תוצאה אחת');
  assert.equal(tHe('search.results', { count: 2 }), '2 תוצאות');
  assert.equal(tHe('search.results', { count: 5 }), '5 תוצאות');
  assert.equal(tHe('overview.notTraced', { count: 2 }), '2 לא מקושרים'); // no "two" form → other
});

test('interpolation, fallback to en, then the key itself', () => {
  const missing = [];
  const t = createT('he', { en: { a: { b: 'Hi {name}' } }, he: {} }, { onMissing: (k) => missing.push(k) });
  assert.equal(t('a.b', { name: 'Gary' }), 'Hi Gary');
  assert.equal(t('nope.key'), 'nope.key');
  assert.deepEqual(missing, ['nope.key']);
  assert.deepEqual(interpolate('Run {cmd} now', { cmd: { el: 1 } }), ['Run ', { el: 1 }, ' now']);
});

test('formatters follow the locale', () => {
  assert.equal(createFormatters('en').number(12345), '12,345');
  const now = Date.parse('2026-01-01T12:00:00Z');
  assert.equal(createFormatters('en').relative('2026-01-01T11:58:00Z', now), '2 minutes ago');
  assert.equal(createFormatters('he').relative('2026-01-01T11:55:00Z', now), 'לפני 5 דקות');
});

test('default language: stored → PRD → browser → en', () => {
  const available = ['en', 'he'];
  const hePrd = { title: 'מודול הזמנות', sections: [{ heading: 'מסך Pending' }] };
  const enPrd = { title: 'Orders module', sections: [{ heading: 'Pending screen' }] };
  assert.ok(prdLooksHebrew(hePrd));
  assert.ok(!prdLooksHebrew(enPrd));
  assert.equal(detectLang({ stored: 'en', prd: hePrd, navigatorLang: 'he-IL', available }), 'en');
  assert.equal(detectLang({ stored: null, prd: hePrd, navigatorLang: 'en-US', available }), 'he');
  assert.equal(detectLang({ stored: null, prd: enPrd, navigatorLang: 'he-IL', available }), 'he');
  assert.equal(detectLang({ stored: 'xx', prd: enPrd, navigatorLang: 'fr', available }), 'en');
});
