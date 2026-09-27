'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IdChip, PrdText, Icon } from './ui.jsx';
import { dirOf, dirOfAll } from '../lib/meta.js';

export default function PrdViewer({ prd, analysis, sectionId, excerpt, onSelectSection, onOpen }) {
  const contentRef = useRef(null);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const bySection = analysis?.provenance?.bySection ?? {};

  // Jump (not smooth-scroll: long PRDs take seconds and get interrupted) to
  // the section, then to the highlighted quote inside it.
  useEffect(() => {
    if (!sectionId || !contentRef.current) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = contentRef.current?.querySelector(`[data-sid="${CSS.escape(sectionId)}"]`);
      if (!el) return;
      const mark = el.querySelector('mark');
      (mark ?? el).scrollIntoView({ block: mark ? 'center' : 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [sectionId, excerpt, prd]);

  // A Hebrew PRD reads right-to-left as a whole: outline numbers and headings
  // sit on the right, and mixed English lines don't flip the layout.
  const docDir = useMemo(() => (prd ? dirOfAll(prd.sections.slice(0, 40).map((s) => s.heading)) : 'ltr'), [prd]);

  if (!prd) return <div className="empty">No PRD extracted. Run <span className="mono">sherlock analyze &lt;prd&gt;</span>.</div>;
  const f = filter.trim().toLowerCase();
  const outline = prd.sections.filter((s) => !f || s.heading.toLowerCase().includes(f) || s.id.includes(f));

  return (
    <div className="prd">
      <nav className="prd-outline" aria-label="PRD outline" dir={docDir}>
        <div style={{ padding: '0 6px 10px' }} dir="ltr">
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{prd.document}</div>
          <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>{prd.sections.length} sections · {prd.words?.toLocaleString()} words</div>
          <input type="search" placeholder="Find section…" value={filter} onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', height: 30, border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', background: 'var(--surface)' }} />
        </div>
        {outline.map((s) => (
          <button type="button" key={s.id} className={s.id === sectionId ? 'on' : ''} style={{ paddingInlineStart: 8 + (s.level - 1) * 12 }} onClick={() => onSelectSection(s.id)}>
            <span className="sid">{s.number ? s.id : '·'}</span>
            <span className="grow" dir={dirOf(s.heading)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.heading}</span>
            {bySection[s.id]?.length > 0 && <span className="cites" title="QA items citing this section">{bySection[s.id].length}</span>}
          </button>
        ))}
      </nav>
      <div className="prd-content" ref={contentRef}>
        <article dir={docDir}>
          {excerpt && (
            <div className="info-box" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <div>Highlighted: the exact PRD text this item was generated from.</div>
            </div>
          )}
          {prd.title && <h1 style={{ marginTop: 0 }} dir={dirOf(prd.title)}>{prd.title}</h1>}
          {prd.sections.map((s) => {
            const H = s.level <= 1 ? 'h2' : 'h3';
            const cites = bySection[s.id] || [];
            const focus = s.id === sectionId;
            return (
              <section key={s.id} data-sid={s.id} className={`prd-section ${focus ? 'focus' : ''}`}>
                <H dir={dirOf(s.heading)}>
                  <span className="mono faint">§{s.id}</span>
                  <span>{s.heading}</span>
                </H>
                {cites.length > 0 && (
                  <div className="cited-by">
                    <span>Generated from this section:</span>
                    {(expanded.has(s.id) ? cites : cites.slice(0, 16)).map((id) => <IdChip key={id} id={id} onOpen={onOpen} />)}
                    {cites.length > 16 && !expanded.has(s.id) && (
                      <button type="button" className="btn sm ghost" onClick={() => setExpanded((x) => new Set(x).add(s.id))}>+{cites.length - 16} more</button>
                    )}
                  </div>
                )}
                <PrdText text={s.text} excerpt={focus ? excerpt : null} />
              </section>
            );
          })}
        </article>
      </div>
    </div>
  );
}
