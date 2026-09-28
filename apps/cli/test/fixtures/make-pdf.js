// Writes minimal, valid text PDFs (Helvetica, one content stream per page)
// for extraction tests. The PDFs are gitignored mock data: pdf.test.js creates
// them when missing, or run this directly to regenerate them:
//   node apps/cli/test/fixtures/make-pdf.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** pages: array of arrays of lines; a line is a string or { text, size }. */
export function makePdf(pages) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = pages.map((lines) => {
    let y = 760;
    const ops = lines.map((l) => {
      const { text, size = 11 } = typeof l === 'string' ? { text: l } : l;
      y -= text ? size + 9 : 14;
      return text ? `BT /F1 ${size} Tf 56 ${y} Td (${esc(text)}) Tj ET` : '';
    }).filter(Boolean).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const SAMPLE_PRD = [
  [
    { text: 'Payments PRD', size: 18 },
    '',
    { text: '1 Introduction', size: 14 },
    'This document describes the payments screen.',
    '',
    { text: '2 Payment Form', size: 14 },
    { text: '2.1 Amount', size: 12 },
    'Amount must be a positive decimal. It cannot be 0.',
    '- Currency is shown with two decimals.',
  ],
  [
    { text: '2.2 Due Date', size: 12 },
    'The due date must be in the future.',
    '',
    { text: '3 Open Questions', size: 14 },
    'Refund rules are TBD.',
  ],
];

export const NO_HEADINGS = [
  ['just some notes without any numbered headings', 'more words to pass the minimum word count check here'],
  ['second page of loose notes and nothing else of interest at all'],
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  fs.writeFileSync(path.join(dir, 'sample-prd.pdf'), makePdf(SAMPLE_PRD));
  fs.writeFileSync(path.join(dir, 'no-headings.pdf'), makePdf(NO_HEADINGS));
  console.log('wrote sample-prd.pdf, no-headings.pdf');
}
