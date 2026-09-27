// Pure translation helpers (no React, no JSON imports) so node --test can load them.

export const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur']);
export const dirFor = (lang) => (RTL_LANGS.has(lang) ? 'rtl' : 'ltr');
export const STORAGE_KEY = 'sherlock.lang';

export function lookup(dict, key) {
  let v = dict;
  for (const part of key.split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[part];
  }
  return v;
}

const isPlural = (v) => v && typeof v === 'object' && typeof v.other === 'string';

/**
 * Split "a {x} b" into parts. Primitive values are joined into a string; any
 * non-primitive value (a React element) makes it return an array of parts.
 */
export function interpolate(str, vars) {
  if (!vars) return str;
  const parts = str.split(/\{(\w+)\}/);
  let rich = false;
  const out = parts.map((p, i) => {
    if (i % 2 === 0) return p;
    const v = vars[p];
    if (v == null) return `{${p}}`;
    if (typeof v === 'object') rich = true;
    return v;
  });
  return rich ? out.filter((p) => p !== '') : out.join('');
}

/** Translate `key` in `lang`, falling back to `fallback` then to the key itself. */
export function createT(lang, dicts, { fallback = 'en', onMissing } = {}) {
  const rules = new Intl.PluralRules(lang);
  return function t(key, vars) {
    let v = lookup(dicts[lang], key);
    if (v === undefined && lang !== fallback) v = lookup(dicts[fallback], key);
    if (v === undefined) {
      onMissing?.(key);
      return key;
    }
    if (isPlural(v)) v = v[rules.select(Number(vars?.count ?? 0))] ?? v.other;
    if (typeof v !== 'string') return key;
    return interpolate(v, vars);
  };
}

export function createFormatters(lang) {
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : lang;
  const num = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return {
    locale,
    number: (n) => (n == null ? '' : num.format(n)),
    date: (iso) => (iso ? date.format(new Date(iso)) : ''),
    relative(iso, now = Date.now()) {
      if (!iso) return '';
      const s = Math.round((new Date(iso).getTime() - now) / 1000);
      const a = Math.abs(s);
      if (a < 45) return rel.format(0, 'second');
      if (a < 3600) return rel.format(Math.round(s / 60), 'minute');
      if (a < 86400) return rel.format(Math.round(s / 3600), 'hour');
      if (a < 7 * 86400) return rel.format(Math.round(s / 86400), 'day');
      return day.format(new Date(iso));
    },
  };
}

const HEBREW = /[א-ת]/g; // letters only, not niqqud
const LETTER = /\p{L}/gu;

/** True when more than 30% of the letters in the PRD title + first headings are Hebrew. */
export function prdLooksHebrew(prd) {
  if (!prd) return false;
  const text = [prd.title, ...(prd.sections || []).slice(0, 12).map((s) => s.heading)].filter(Boolean).join(' ');
  const letters = text.match(LETTER)?.length ?? 0;
  return letters > 0 && (text.match(HEBREW)?.length ?? 0) / letters > 0.3;
}

/** Default language: stored choice → PRD language → browser language → en. */
export function detectLang({ stored, prd, navigatorLang, available }) {
  if (stored && available.includes(stored)) return stored;
  if (available.includes('he') && prdLooksHebrew(prd)) return 'he';
  const nav = String(navigatorLang || '').toLowerCase().split('-')[0];
  if (available.includes(nav) && nav === 'he') return 'he';
  return 'en';
}
