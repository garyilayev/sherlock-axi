// PDF extraction (pdfjs-dist): numbered headings → sections, page fallback,
// provenance on extracted text, and structured CLI errors for bad PDFs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractPrd } from '../src/prd/extract.js';
import { resolveSection, verifySource } from '@sherlock/qa-model';
import { makePdf } from './fixtures/make-pdf.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, 'fixtures');
const BIN = path.resolve(here, '../bin/sherlock.js');

test('numbered headings become sections across pages', async () => {
  const prd = await extractPrd(path.join(FIX, 'sample-prd.pdf'));
  assert.equal(prd.format, 'pdf');
  assert.deepEqual(prd.sections.filter((s) => s.number).map((s) => s.id), ['1', '2', '2.1', '2.2', '3']);
  assert.equal(resolveSection(prd, '2.1').heading, 'Amount');
  assert.equal(resolveSection(prd, '2.2').level, 2);
  assert.match(resolveSection(prd, '2.1').text, /^Amount must be a positive decimal\. It cannot be 0\.\n\n- Currency/);
  assert.equal(resolveSection(prd, '3').text, 'Refund rules are TBD.'); // page 2
});

test('extracted PDF text supports provenance checks', async () => {
  const prd = await extractPrd(path.join(FIX, 'sample-prd.pdf'));
  assert.equal(verifySource(prd, { section: '2.1', excerpt: 'Amount must be a positive decimal' }).status, 'verified');
  assert.equal(verifySource(prd, { section: '2.1', excerpt: 'due date must be in the future' }).status, 'section-mismatch');
  assert.equal(verifySource(prd, { section: '2.2', excerpt: 'refunds are instant' }).status, 'excerpt-not-found');
});

test('a PDF without numbered headings falls back to one section per page', async () => {
  const prd = await extractPrd(path.join(FIX, 'no-headings.pdf'));
  assert.deepEqual(prd.sections.map((s) => s.heading), ['Page 1', 'Page 2']);
  assert.match(prd.sections[1].text, /second page/);
});

test('CLI: analyze a PDF; empty and corrupt PDFs are structured errors (exit 5)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlock-pdf-'));
  fs.copyFileSync(path.join(FIX, 'sample-prd.pdf'), path.join(dir, 'prd.pdf'));
  fs.writeFileSync(path.join(dir, 'blank.pdf'), makePdf([[]]));
  fs.writeFileSync(path.join(dir, 'corrupt.pdf'), '%PDF-1.4\nthis is not a pdf');
  const run = (...a) => spawnSync(process.execPath, [BIN, ...a], { cwd: dir, encoding: 'utf8' });

  const ok = run('analyze', 'prd.pdf');
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /FORMAT:\s+pdf/);
  assert.match(fs.readFileSync(path.join(dir, '.sherlock/prd.md'), 'utf8'), /## \[§2\.1\] Amount/);

  const blank = run('analyze', 'blank.pdf');
  assert.equal(blank.status, 5);
  assert.match(blank.stdout, /^ERROR PRD_EMPTY/);

  const bad = run('analyze', 'corrupt.pdf');
  assert.equal(bad.status, 5);
  assert.match(bad.stdout, /^ERROR EXTRACT_FAILED/);
  assert.match(bad.stdout, /NEXT:/);
});
