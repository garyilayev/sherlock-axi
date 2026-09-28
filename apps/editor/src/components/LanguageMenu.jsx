'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { FLAGS } from './flags.jsx';
import { Icon } from './ui.jsx';

function Flag({ lang, size }) {
  const F = FLAGS[lang];
  return <span className="flag" style={{ width: size, height: size }}>{F ? <F size={size} /> : lang}</span>;
}

/** Round flag button in the header; opens a small language menu. */
export default function LanguageMenu() {
  const { lang, langs, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef(null);
  const menu = useRef(null);

  const show = () => { setActive(Math.max(0, langs.indexOf(lang))); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const choose = (l) => { setLang(l); close(); };

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelectorAll('[role="menuitemradio"]')[active]?.focus();
    const onDown = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMenuKey = (e) => {
    const n = langs.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <div className="menu lang-menu">
      <button
        ref={btn}
        type="button"
        className="lang-btn"
        aria-label={t('language.switch')}
        title={t('language.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); } }}
      >
        <Flag lang={lang} size={32} />
      </button>
      {open && (
        <div ref={menu} className="menu-pop lang-pop" role="menu" aria-label={t('language.switch')} onKeyDown={onMenuKey}>
          {langs.map((l, i) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === lang}
              tabIndex={i === active ? 0 : -1}
              lang={l}
              onClick={() => choose(l)}
            >
              <Flag lang={l} size={20} />
              {/* Each language's name is written in that language. */}
              <span className="grow">{t(`language.${l}`)}</span>
              {l === lang && <Icon name="check" size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
