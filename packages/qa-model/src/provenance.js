// Provenance: "Why did Sherlock generate this?"
// Checks that every cited PRD section exists and that quoted excerpts really
// appear in the PRD text. This is Sherlock's guard against hallucinated sources.

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[\u0591-\u05C7]/g, '') // Hebrew niqqud / cantillation
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanSectionRef(ref) {
  return String(ref ?? '')
    .trim()
    .replace(/^(§|section|sec\.?)\s*/i, '')
    .replace(/\.$/, '')
    .trim();
}

/** Find a PRD section by id/number ("3.8", "§3.8") or by heading text. */
export function resolveSection(prd, ref) {
  if (!prd?.sections?.length || ref == null || ref === '') return null;
  const r = cleanSectionRef(ref);
  const lower = r.toLowerCase();
  const n = normalize(r);
  return (
    prd.sections.find((s) => s.id === r || s.number === r) ||
    prd.sections.find((s) => s.heading?.toLowerCase() === lower) ||
    prd.sections.find((s) => normalize(`${s.number ?? ''} ${s.heading}`) === n) ||
    prd.sections.find((s) => n && normalize(s.heading).startsWith(n)) ||
    null
  );
}

function fragmentsOf(excerpt) {
  return String(excerpt)
    .split(/\.{3}|…/)
    .map(normalize)
    .filter((f) => f.length >= 3);
}

function contains(haystackNorm, excerpt) {
  const frags = fragmentsOf(excerpt);
  return frags.length > 0 && frags.every((f) => haystackNorm.includes(f));
}

/** Searchable text of a section: its heading (PRDs often put content in headings) + body. */
const sectionHay = (s) => normalize(`${s.heading ?? ''} ${s.text ?? ''}`);

function tokenOverlap(haystackNorm, excerpt) {
  const tokens = normalize(excerpt).split(' ').filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const hay = new Set(haystackNorm.split(' '));
  return tokens.filter((t) => hay.has(t)).length / tokens.length;
}

/**
 * Verify one source reference.
 * status:
 *   verified          section exists and excerpt found in it
 *   section-mismatch  excerpt found, but in a different section (see foundIn)
 *   paraphrased       excerpt not verbatim, but >=85% of its words are in the section
 *   excerpt-not-found section exists, excerpt not found anywhere
 *   section-only      section exists, no excerpt given
 *   section-not-found cited section does not exist
 *   inherited         no PRD location; provenance comes from a linked entity
 *   missing           no source at all
 *   no-prd            no extracted PRD to verify against
 */
export function verifySource(prd, source) {
  if (!source || typeof source !== 'object' || !Object.keys(source).length) {
    return { status: 'missing' };
  }
  const hasLocation = source.section || source.excerpt;
  if (!hasLocation) {
    const via = source.requirementId || source.entityId || source.derivedFrom;
    return via ? { status: 'inherited', via } : { status: 'missing' };
  }
  if (!prd?.sections?.length) return { status: 'no-prd' };

  const section = source.section ? resolveSection(prd, source.section) : null;
  if (source.section && !section && !source.excerpt) {
    return { status: 'section-not-found' };
  }
  if (!source.excerpt) return { status: 'section-only', sectionId: section.id };

  if (section && contains(sectionHay(section), source.excerpt)) {
    return { status: 'verified', sectionId: section.id };
  }
  const elsewhere = prd.sections.find((s) => contains(sectionHay(s), source.excerpt));
  if (elsewhere) {
    return {
      status: section ? 'section-mismatch' : source.section ? 'section-not-found' : 'verified',
      sectionId: elsewhere.id,
      foundIn: elsewhere.id,
    };
  }
  if (section && tokenOverlap(sectionHay(section), source.excerpt) >= 0.85) {
    return { status: 'paraphrased', sectionId: section.id };
  }
  if (!section && source.section) return { status: 'section-not-found' };
  return { status: 'excerpt-not-found', sectionId: section?.id };
}

export const TRUSTED_SOURCE = new Set(['verified', 'paraphrased', 'section-only', 'inherited']);
