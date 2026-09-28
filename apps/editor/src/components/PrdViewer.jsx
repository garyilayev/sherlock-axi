'use client';
import { useEffect, useRef, useState } from 'react';
import { IdChip, PrdText, Icon, Bidi } from './ui.jsx';
import { useI18n } from '../i18n/index.js';

export default function PrdViewer({ prd, analysis, sectionId, excerpt, onSelectSection, onOpen }) {
  const { t, fmt } = useI18n();
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

  if (!prd) return <div className="empty">{t('prd.notExtracted', { cmd: <span className="mono" dir="ltr">sherlock analyze &lt;prd&gt;</span> })}</div>;
  const f = filter.trim().toLowerCase();
  const outline = prd.sections.filter((s) => !f || s.heading.toLowerCase().includes(f) || s.id.includes(f));

  // Layout follows the UI direction; each heading/paragraph orders its own text (see .bidi).
  return (
    <div className="prd">
      <nav className="prd-outline" aria-label={t('prd.outline')}>
        <div style={{ padding: '0 6px 10px' }}>
          <Bidi as="div" style={{ fontWeight: 600, marginBottom: 2 }}>{prd.document}</Bidi>
          <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>{t('prd.stats', { sections: fmt.number(prd.sections.length), words: fmt.number(prd.words) })}</div>
          <input type="search" dir="auto" placeholder={t('prd.findSection')} value={filter} onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', height: 30, border: '1px solid var(--border)', borderRadius: 6, paddingInline: 8, background: 'var(--surface)' }} />
        </div>
        {outline.map((s) => (
          <button type="button" key={s.id} className={s.id === sectionId ? 'on' : ''} style={{ paddingInlineStart: 8 + (s.level - 1) * 12 }} onClick={() => onSelectSection(s.id)}>
            <span className="sid" dir="ltr">{s.number ? s.id : '·'}</span>
            <Bidi className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.heading}</Bidi>
            {bySection[s.id]?.length > 0 && <span className="cites" title={t('prd.citingCount')}>{bySection[s.id].length}</span>}
          </button>
        ))}
      </nav>
      <div className="prd-content" ref={contentRef}>
        <article>
          {excerpt && (
            <div className="info-box" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <div>{t('prd.highlighted')}</div>
            </div>
          )}
          {prd.title && <Bidi as="h1" style={{ marginTop: 0 }}>{prd.title}</Bidi>}
          {prd.sections.map((s) => {
            const H = s.level <= 1 ? 'h2' : 'h3';
            const cites = bySection[s.id] || [];
            const focus = s.id === sectionId;
            return (
              <section key={s.id} data-sid={s.id} className={`prd-section ${focus ? 'focus' : ''}`}>
                <H>
                  <bdi className="mono faint" dir="ltr">§{s.id}</bdi>
                  <Bidi>{s.heading}</Bidi>
                </H>
                {cites.length > 0 && (
                  <div className="cited-by">
                    <span>{t('prd.generatedFrom')}</span>
                    {(expanded.has(s.id) ? cites : cites.slice(0, 16)).map((id) => <IdChip key={id} id={id} onOpen={onOpen} />)}
                    {cites.length > 16 && !expanded.has(s.id) && (
                      <button type="button" className="btn sm ghost" onClick={() => setExpanded((x) => new Set(x).add(s.id))}>{t('inspector.more', { count: cites.length - 16 })}</button>
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
