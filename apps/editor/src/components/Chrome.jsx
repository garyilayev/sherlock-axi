'use client';
import { useState } from 'react';
import { Icon, Logo, Bidi } from './ui.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import { shortcutLabel } from './Spotlight.jsx';
import { PRIMARY, SECONDARY } from '../lib/meta.js';
import { useI18n } from '../i18n/index.js';

export function Header({ state, status, navigate, refresh, onSearch }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const label = status === 'live' ? t('header.local') : status === 'connecting' ? t('header.connecting') : t('header.offline');
  return (
    <header className="header">
      <div className="brand"><Logo /> Sherlock</div>
      <div className="header-spacer" />
      {state?.model && (
        <button type="button" className="btn icon-btn" aria-label={t('search.open')} title={`${t('search.open')} (${shortcutLabel()})`} aria-keyshortcuts="Control+K Meta+K /" onClick={onSearch}>
          <Icon name="search" size={18} />
        </button>
      )}
      <LanguageMenu />
      <span className={`local-pill ${status === 'live' ? '' : status}`} title={status === 'live' ? t('header.localTooltip') : t('header.offlineTooltip')}>
        <span className="dot" />{label}
      </span>
      <button type="button" className="btn" onClick={() => navigate('prd')} disabled={!state?.prd}>
        {t('header.openPrd')}
      </button>
      <div className="menu">
        <button type="button" className="btn icon-btn" aria-label={t('header.more')} onClick={() => setMenu((m) => !m)}><Icon name="more" /></button>
        {menu && (
          <div className="menu-pop" onMouseLeave={() => setMenu(false)}>
            <button type="button" onClick={() => { refresh(); setMenu(false); }}>{t('header.reload')}</button>
            <button type="button" onClick={() => { navigate('feedback'); setMenu(false); }}>{t('header.allFeedback')}</button>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(state?.workspace ?? ''); setMenu(false); }}>{t('header.copyPath')}</button>
            <div className="meta" dir="auto">
              {state?.prd?.document && <>{t('header.prdLabel', { doc: state.prd.document })}<br /></>}
              <bdi dir="ltr">{state?.workspace}</bdi>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export function Sidebar({ state, route, navigate }) {
  const { t, fmt } = useI18n();
  const model = state?.model;
  const a = state?.analysis;
  const openFb = (state?.feedback || []).filter((f) => f.status === 'open').length;
  const item = (view, count, extra) => (
    <button key={view} type="button" className={`nav-item ${route.view === view ? 'active' : ''}`} onClick={() => navigate(view)}>
      <Icon name={view} size={16} />
      <span>{t(`nav.${view}`)}</span>
      {extra ?? (count != null && <span className="count">{count}</span>)}
    </button>
  );
  const secondary = SECONDARY.filter((k) => model?.[k]?.length);
  return (
    <nav className="sidebar" aria-label={t('nav.aria')}>
      <div className="project-card">
        <span className="pc-icon"><Icon name="file" size={20} /></span>
        <div className="grow">
          <Bidi as="h2">{model?.project?.name ?? t('app.name')}</Bidi>
          {model?.project?.subtitle ? <Bidi as="div" className="sub">{model.project.subtitle}</Bidi> : <div className="sub">{t('app.qaGuide')}</div>}
        </div>
      </div>
      <div className="nav-group">
        {item('overview')}
        {PRIMARY.map((k) => item(k, model?.[k]?.length ?? 0,
          k === 'gaps' && a?.openGaps ? <span className="alert" title={t('nav.openGaps')}>{a.openGaps}</span> : undefined))}
      </div>
      {secondary.length > 0 && (
        <div className="nav-group">
          <div className="nav-label">{t('nav.groupModel')}</div>
          {secondary.map((k) => item(k, model[k].length))}
        </div>
      )}
      <div className="nav-group">
        <div className="nav-label">{t('nav.groupReview')}</div>
        {item('feedback', null, openFb ? <span className="alert" title={t('nav.openFeedback')}>{openFb}</span> : <span className="count">{state?.feedback?.length ?? 0}</span>)}
        {item('prd', state?.prd?.sections?.length)}
      </div>
      {state?.prd?.document && (
        <div className="sidebar-foot">
          <Icon name="checkSquare" size={16} />
          <div>
            {t('sidebar.generatedFrom')}<br />
            <bdi style={{ wordBreak: 'break-all' }}>{state.prd.document}</bdi><br />
            {t('sidebar.by')}
            <div className="date">
              {t('sidebar.revision', { rev: state.project?.revision ?? 0 })}
              {state.project?.updatedAt && ` · ${fmt.date(state.project.updatedAt)}`}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
