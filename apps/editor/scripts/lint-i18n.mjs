#!/usr/bin/env node
// Guardrails for the EN/HE editor (docs/specs/editor-spotlight-i18n.md §4.6):
//  1. no hard-coded English in JSX text or in aria-label / title / placeholder
//     string literals — UI text must come from t();
//  2. no physical left/right CSS properties in styles.css — use logical ones so RTL works.
// Heuristic by design (regexes, not a parser); legitimate exceptions go in ALLOW.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src');

// Words that may appear untranslated: product names, key names, and the
// terms the PRD itself keeps in English.
const ALLOW_WORDS = ['Sherlock', 'Claude', 'Code', 'Ctrl', 'Esc', 'PRD', 'QA'];
// Whole text nodes that are code, e.g. CLI commands shown in <code>.
const ALLOW_TEXT = [/^\s*\/?sherlock\b[\w\s.&;-]*$/];
// Exact lines (trimmed) that are allowed to fail a check. In CSS, a line can
// also opt out with a `/* i18n-lint: allow */` comment.
const ALLOW_LINES = new Set([]);

const problems = [];
const report = (file, line, msg, text) => {
  if (ALLOW_LINES.has(text.trim())) return;
  problems.push(`${path.relative(root, file)}:${line}  ${msg}: ${text.trim().slice(0, 100)}`);
};

const hasLatin = (s) => {
  let rest = s;
  for (const w of ALLOW_WORDS) rest = rest.replace(new RegExp(`\\b${w}\\b`, 'g'), '');
  return /[A-Za-z]/.test(rest);
};

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const CODE_LIKE = /=>|&&|\|\||[();=?]|^\s*[:.,]/;

for (const file of walk(SRC)) {
  // Blank out comments but keep offsets (so line numbers stay right).
  const src = fs.readFileSync(file, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

  // 1a. JSX text: between a tag's ">" (or an expression's "}") and the next "<" or "{".
  // A segment after "}" only counts when it runs into a tag (else it's JS like "} else {").
  for (const m of src.matchAll(/(?<![=\-])(?:>([^<>{}]+)(?=<|\{)|\}([^<>{}]+)(?=<))/g)) {
    const text = m[1] ?? m[2];
    if (!text.trim() || text.trim().includes('\n') || (m[2] && text.includes('\n'))) continue;
    if (CODE_LIKE.test(text) || ALLOW_TEXT.some((re) => re.test(text))) continue;
    if (hasLatin(text)) report(file, lineOf(src, m.index + 1), 'JSX text not wrapped in t()', text);
  }

  // 1b. aria-label / title / placeholder given a string literal or a template literal.
  for (const m of src.matchAll(/\b(aria-label|title|placeholder)=(?:"([^"]*)"|'([^']*)'|\{\s*(["'`])((?:\\.|(?!\4)[^\\])*)\4\s*\})/g)) {
    const value = (m[2] ?? m[3] ?? m[5] ?? '').replace(/\$\{[^}]*\}/g, '');
    if (hasLatin(value)) report(file, lineOf(src, m.index), `${m[1]} not wrapped in t()`, m[0]);
  }
}

// 2. Physical CSS properties.
const cssFile = path.join(SRC, 'styles.css');
const rawCss = fs.readFileSync(cssFile, 'utf8');
const rawLines = rawCss.split('\n');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const PHYSICAL = [
  [/\b(margin|padding|border)-(left|right)\b/g, 'physical property'],
  [/(?<![\w-])(left|right)\s*:/g, 'physical offset'],
  [/text-align\s*:\s*(left|right)\b/g, 'physical text-align'],
];
for (const [re, msg] of PHYSICAL) {
  for (const m of css.matchAll(re)) {
    const line = lineOf(css, m.index);
    if (rawLines[line - 1].includes('i18n-lint: allow')) continue;
    report(cssFile, line, `${msg} (use a logical property)`, rawLines[line - 1]);
  }
}

if (problems.length) {
  console.error(`lint:i18n found ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('lint:i18n ok');
