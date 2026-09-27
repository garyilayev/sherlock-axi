// Dependency-free .docx → blocks. Reads word/document.xml directly, keeps
// headings (by style/outline level), paragraphs, list items and tables.
import { readZip } from './zip.js';

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

function parseStyles(xml) {
  const styles = new Map();
  if (!xml) return styles;
  for (const m of xml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const name = m[2].match(/<w:name w:val="([^"]+)"/)?.[1] ?? '';
    const outline = m[2].match(/<w:outlineLvl w:val="(\d)"/)?.[1];
    styles.set(m[1], { name, outline: outline != null ? Number(outline) : null });
  }
  return styles;
}

function headingLevel(styleId, pXml, styles) {
  const direct = pXml.match(/<w:outlineLvl w:val="(\d)"/)?.[1];
  if (direct != null && Number(direct) < 9) return Number(direct) + 1;
  if (!styleId) return null;
  const st = styles.get(styleId);
  const name = st?.name || styleId;
  if (/^title$/i.test(name)) return 0;
  const m = name.match(/^heading\s*(\d)$/i) || styleId.match(/^Heading(\d)$/i);
  if (m) return Number(m[1]);
  if (st?.outline != null && st.outline < 9) return st.outline + 1;
  return null;
}

function paragraphText(pXml) {
  const x = pXml.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '');
  let text = '';
  for (const m of x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
    if (m[1] !== undefined) text += decode(m[1]);
    else text += m[0].startsWith('<w:tab') ? '\t' : '\n';
  }
  return text.replace(/[ \t]+/g, ' ').trim();
}

/** Split XML into top-level elements of the given tags, respecting nesting. */
function topLevel(xml, tags) {
  const out = [];
  const open = new RegExp(`<(${tags.join('|')})(?=[\\s>/])`, 'g');
  let m;
  while ((m = open.exec(xml))) {
    const tag = m[1];
    const start = m.index;
    const selfClose = xml.slice(start, xml.indexOf('>', start) + 1).endsWith('/>');
    if (selfClose) { out.push({ tag, xml: '' }); continue; }
    const re = new RegExp(`<${tag}(?=[\\s>/])|</${tag}>`, 'g');
    re.lastIndex = start;
    let depth = 0, end = xml.length, t;
    while ((t = re.exec(xml))) {
      if (t[0].startsWith('</')) { if (--depth === 0) { end = re.lastIndex; break; } }
      else if (!xml.slice(t.index, xml.indexOf('>', t.index) + 1).endsWith('/>')) depth++;
    }
    out.push({ tag, xml: xml.slice(start, end) });
    open.lastIndex = end;
  }
  return out;
}

function tableToText(tblXml) {
  const rows = [];
  for (const tr of topLevel(tblXml.replace(/^<w:tbl[^>]*>|<\/w:tbl>$/g, ''), ['w:tr'])) {
    const cells = topLevel(tr.xml.replace(/^<w:tr[^>]*>|<\/w:tr>$/g, ''), ['w:tc']).map((tc) =>
      topLevel(tc.xml, ['w:p']).map((p) => paragraphText(p.xml)).filter(Boolean).join(' ').replace(/\|/g, '/'),
    );
    if (cells.some(Boolean)) rows.push(`| ${cells.join(' | ')} |`);
  }
  if (rows.length > 1) rows.splice(1, 0, `|${rows[0].split('|').slice(1, -1).map(() => ' --- ').join('|')}|`);
  return rows.join('\n');
}

export function docxToBlocks(buf) {
  const zip = readZip(buf);
  const doc = zip.read('word/document.xml');
  if (!doc) throw new Error('word/document.xml missing — is this a .docx?');
  const styles = parseStyles(zip.read('word/styles.xml')?.toString('utf8'));
  const xml = doc.toString('utf8');
  const body = xml.slice(xml.indexOf('<w:body'), xml.lastIndexOf('</w:body>'));
  const blocks = [];
  for (const el of topLevel(body.replace(/^<w:body[^>]*>/, ''), ['w:p', 'w:tbl', 'w:sdt'])) {
    const items = el.tag === 'w:sdt' ? topLevel(el.xml, ['w:p', 'w:tbl']) : [el];
    for (const it of items) {
      if (it.tag === 'w:tbl') {
        const t = tableToText(it.xml);
        if (t) blocks.push({ type: 'text', text: t });
        continue;
      }
      const text = paragraphText(it.xml);
      if (!text) continue;
      const styleId = it.xml.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
      if (/^TOC/i.test(styleId || '')) continue; // table of contents entries
      const level = headingLevel(styleId, it.xml, styles);
      if (level === 0) blocks.push({ type: 'title', text });
      else if (level) blocks.push({ type: 'heading', level, text });
      else if (/<w:numPr>/.test(it.xml) || /^List/i.test(styleId || '')) blocks.push({ type: 'text', text: `- ${text}` });
      else blocks.push({ type: 'text', text });
    }
  }
  return blocks;
}
