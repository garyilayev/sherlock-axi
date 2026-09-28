'use client';
import { createContext, createElement, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createFormatters, createT, detectLang, dirFor, lookup, prdLooksHebrew, STORAGE_KEY } from './core.js';
import en from './en.json';
import he from './he.json';

// Adding a language: drop in xx.json, import it here and add a flag in components/flags.jsx.
export const DICTS = { en, he };
export const LANGS = Object.keys(DICTS);

const warned = new Set();
const onMissing = process.env.NODE_ENV === 'production' ? undefined : (key) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[i18n] missing key: ${key}`);
};

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function build(lang) {
  const base = createT(lang, DICTS, { onMissing });
  // Placeholders filled with elements (e.g. {cmd} → <code>) come back as parts.
  const t = (key, vars) => {
    const r = base(key, vars);
    return Array.isArray(r) ? createElement(Fragment, null, ...r) : r;
  };
  const has = (key) => lookup(DICTS[lang], key) !== undefined || lookup(DICTS.en, key) !== undefined;
  /** Display label for an enum value, e.g. tv('testType', 'negative'); unknown values show as-is. */
  const tv = (ns, value) => (value == null || value === '' ? '' : has(`${ns}.${value}`) ? t(`${ns}.${value}`) : String(value));
  return { lang, dir: dirFor(lang), t, tv, has, fmt: createFormatters(lang) };
}

const I18nContext = createContext(null);

export function I18nProvider({ prd, children }) {
  // Static export pre-renders in English; the real language is applied after mount
  // (the pre-paint script in app/layout.jsx already set <html dir> from localStorage).
  const [lang, setLangState] = useState('en');
  const [detected, setDetected] = useState(false);
  const prdHe = prdLooksHebrew(prd);

  useEffect(() => {
    setLangState(detectLang({ stored: readStored(), prd: prdHe ? prd : null, navigatorLang: navigator.language, available: LANGS }));
    setDetected(true);
  }, [prdHe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Not before detection: the initial 'en' would undo the pre-paint script's dir.
  useEffect(() => {
    if (!detected) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
  }, [lang, detected]);

  const setLang = useCallback((next) => {
    if (!DICTS[next]) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ ...build(lang), setLang, langs: LANGS }), [lang, setLang]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n() outside <I18nProvider>');
  return ctx;
}
