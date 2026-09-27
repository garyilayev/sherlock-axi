// PRD extraction: .md / .docx / .pdf → sectioned PRD (prd.json) + an
// anchored markdown rendering (prd.md) that Claude reads and cites.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { docxToBlocks } from './docx.js';

export const SUPPORTED = ['.md', '.markdown', '.txt', '.docx', '.pdf'];

// ---------- format readers → blocks ----------

function markdownToBlocks(src) {
  const blocks = [];
  let fence = false;
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'text', text: para.join('\n').trim() });
    para = [];
  };
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; para.push(line); continue; }
    const h = !fence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) { flush(); blocks.push({ type: 'heading', level: h[1].length, text: h[2] }); continue; }
    if (!fence && !line.trim()) { flush(); continue; }
    para.push(line);
  }
  flush();
  // A single top-level "# Title" followed by numbered sections is the doc title.
  const h1 = blocks.filter((b) => b.type === 'heading' && b.level === 1);
  if (h1.length === 1 && blocks[0] === h1[0] && !/^\d/.test(h1[0].text)) {
    blocks[0] = { type: 'title', text: h1[0].text };
  }
  return blocks;
}

async function pdfLines(file) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      let line = '', lastY = null;
      const lines = [];
      for (const it of content.items) {
        const y = it.transform?.[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
        line += it.str;
        if (it.hasEOL) { lines.push(line); line = ''; }
        lastY = y;
      }
      if (line) lines.push(line);
      pages.push(lines);
    }
    return pages;
  } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
  try {
    const out = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    return out.split('\f').map((p) => p.split('\n'));
  } catch {
    throw new Error('No PDF reader available. Run `npm install` (installs pdfjs-dist) or install poppler (pdftotext).');
  }
}

const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+){0,4})\.?\s{1,4}([A-Z][^\n]{1,90})$/;

function pdfToBlocks(pages) {
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'text', text: para.join(' ').replace(/\s+/g, ' ').trim() });
    para = [];
  };
  let headings = 0;
  pages.forEach((lines) => {
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      const m = line.match(NUMBERED_HEADING);
      if (m && !/[.:;,]$/.test(m[2].trim()) && m[2].trim().split(/\s+/).length <= 12) {
        flush();
        blocks.push({ type: 'heading', level: m[1].split('.').length, text: `${m[1]} ${m[2].trim()}` });
        headings++;
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      if (/^\s*([-•●▪*]|\d+[.)])\s+/.test(line)) flush();
      para.push(line.trim().replace(/^[•●▪]\s*/, '- '));
    }
    flush();
  });
  if (headings) return blocks;
  // No detectable headings — fall back to one section per page.
  return pages.flatMap((lines, i) => [
    { type: 'heading', level: 1, text: `Page ${i + 1}` },
    { type: 'text', text: lines.join('\n').trim() },
  ]);
}

// ---------- blocks → sections ----------

const NUM_PREFIX = /^(?:section\s+)?(\d+(?:\.\d+)*)\.?\s*[.\-–:]?\s+(.+)$/i;

const cmpNum = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

/**
 * Turn blocks into sections with stable ids. Real PRDs are messy (typed
 * numbers, skipped numbers, inconsistent heading styles), so:
 *  - typed numbers ("3.8 Grant Price") become the section id
 *  - an unnumbered heading directly followed by "6.1 …" is inferred to be §6
 *  - numbers that break the sequence (a stray "11." inside §9) are ignored
 *  - other unnumbered headings get "<last number>/<n>" (e.g. 9.3/4) and are
 *    nested under the last numbered section
 *  - documents with no typed numbers get a computed outline (1, 1.1, …)
 */
export function sectionize(blocks, { document, format }) {
  const title = blocks.find((b) => b.type === 'title')?.text ?? null;
  const heads = blocks.filter((b) => b.type === 'heading');
  const parsed = heads.map((h) => {
    const m = h.text.match(NUM_PREFIX);
    return m ? { number: m[1], heading: m[2].trim() } : null;
  });
  const anyNumbered = parsed.some(Boolean);

  // Drop numbers that are out of sequence with both neighbours.
  const numbered = parsed.map((p, i) => [p, i]).filter(([p]) => p);
  numbered.forEach(([p], k) => {
    const prev = numbered[k - 1]?.[0], next = numbered[k + 1]?.[0];
    if (prev && next && cmpNum(p.number, next.number) > 0 && cmpNum(prev.number, next.number) < 0) p.stray = true;
  });

  const sections = [];
  const used = new Set();
  const uniq = (id) => {
    let out = id, n = 1;
    while (used.has(out)) out = `${id}-${++n}`;
    used.add(out);
    return out;
  };
  const counters = [];
  let anchor = null;        // last numbered section
  let run = 0;              // unnumbered headings since anchor
  let shift = 0;            // level shift applied to an unnumbered run
  let cur = null;
  let hi = -1;

  for (const b of blocks) {
    if (b.type === 'heading') {
      hi++;
      const p = parsed[hi] && !parsed[hi].stray ? parsed[hi] : null;
      let id, number = null, heading = b.text.replace(/^[\s.\-–:]+/, ''), level = b.level;
      if (p) {
        number = p.number;
        heading = p.heading;
        level = number.split('.').length;
      } else if (anyNumbered) {
        // Infer "6" for an unnumbered heading followed by "6.1".
        const nextIdx = parsed.findIndex((x, j) => j > hi && x && !x.stray);
        const next = parsed[nextIdx];
        const between = heads.slice(hi + 1, nextIdx).some((h) => h.level <= b.level);
        if (next && !between && next.number.includes('.')) {
          const parent = next.number.split('.').slice(0, -1).join('.');
          if (!used.has(parent) && (!anchor || cmpNum(parent, anchor.number) > 0)) {
            number = parent;
            level = parent.split('.').length;
          }
        }
      } else {
        counters.length = b.level;
        counters[b.level - 1] = (counters[b.level - 1] ?? 0) + 1;
        for (let i = 0; i < b.level - 1; i++) counters[i] ??= 1;
        number = counters.join('.');
      }
      if (number) {
        id = uniq(number);
        anchor = { number, level };
        run = 0;
        shift = 0;
      } else {
        run++;
        if (anchor) {
          shift = Math.max(shift, anchor.level + 1 - b.level);
          level = b.level + shift;
          id = uniq(`${anchor.number}/${run}`);
        } else id = uniq(`0/${run}`);
      }
      cur = { id, number, heading, level: Math.min(level, 6), paragraphs: [] };
      sections.push(cur);
    } else if (b.type === 'text') {
      if (!cur) {
        cur = { id: uniq('0'), number: null, heading: title ?? 'Preamble', level: 1, paragraphs: [] };
        sections.push(cur);
      }
      cur.paragraphs.push(b.text);
    }
  }
  const out = sections.map(({ paragraphs, ...s }) => ({ ...s, text: paragraphs.join('\n\n') }));
  const words = out.reduce((n, s) => n + (s.text.match(/\S+/g)?.length ?? 0), 0);
  return { document, format, title, extractedAt: new Date().toISOString(), words, sections: out };
}

export function renderPrdMarkdown(prd) {
  const lines = [
    `<!-- Sherlock PRD extract of ${prd.document}. Cite sections by the id in [§…]; quote excerpts verbatim. -->`,
    '',
  ];
  if (prd.title) lines.push(`# ${prd.title}`, '');
  for (const s of prd.sections) {
    lines.push(`${'#'.repeat(Math.min(6, s.level + (prd.title ? 1 : 0)))} [§${s.id}] ${s.heading}`, '');
    if (s.text) lines.push(s.text, '');
  }
  return lines.join('\n');
}

export async function extractPrd(file) {
  const ext = path.extname(file).toLowerCase();
  const document = path.basename(file);
  let blocks;
  if (ext === '.docx') blocks = docxToBlocks(fs.readFileSync(file));
  else if (ext === '.pdf') blocks = pdfToBlocks(await pdfLines(file));
  else blocks = markdownToBlocks(fs.readFileSync(file, 'utf8'));
  return sectionize(blocks, { document, format: ext.slice(1) });
}
