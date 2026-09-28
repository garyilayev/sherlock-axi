'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSherlock } from './lib/api.js';
import { useHashRoute } from './lib/router.js';
import { KINDS, kindOfId, indexModel } from './lib/meta.js';
import { addRecent } from './lib/recent.js';
import { I18nProvider, useI18n } from './i18n/index.js';
import { Header, Sidebar } from './components/Chrome.jsx';
import { Icon, Logo } from './components/ui.jsx';
import Overview from './components/Overview.jsx';
import EntityList from './components/EntityList.jsx';
import Inspector from './components/Inspector.jsx';
import PrdViewer from './components/PrdViewer.jsx';
import Spotlight from './components/Spotlight.jsx';
import { FeedbackView } from './components/Feedback.jsx';

function Splash({ title, children }) {
  return (
    <div className="center-screen">
      <div>
        <Logo size={44} />
        <h1>{title}</h1>
        <div>{children}</div>
      </div>
    </div>
  );
}

const isEditable = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

export default function App() {
  const api = useSherlock();
  return (
    <I18nProvider prd={api.state?.prd}>
      <Workspace api={api} />
    </I18nProvider>
  );
}

function Workspace({ api }) {
  const { t, has, setLang } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [route, navigate] = useHashRoute();
  const [toast, setToast] = useState(null);
  const [spotlight, setSpotlight] = useState(false);
  const { state } = api;
  const byId = useMemo(() => indexModel(state?.model), [state?.model]);

  // Toast when Claude pushes a new revision.
  useEffect(() => {
    if (api.lastEvent?.type !== 'model') return;
    const ch = state?.project?.lastChange;
    const n = ch ? (ch.added?.length ?? 0) + (ch.modified?.length ?? 0) + (ch.removed?.length ?? 0) : 0;
    setToast({ rev: api.lastEvent.revision, n });
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [api.lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selecting an entity keeps the current list view when it matches, otherwise jumps to its kind.
  // Stable per view, so memoized table rows don't re-render on every selection.
  const openEntity = useCallback((id) => {
    const kind = kindOfId(id);
    if (!kind) return;
    const v = route.view;
    const view = v === kind || v === 'overview' || v === 'feedback' || v === 'prd' ? v : kind;
    navigate(view === 'prd' ? kind : view, id);
  }, [route.view, navigate]);

  const selectedId = route.id && kindOfId(route.id) ? route.id : null;
  useEffect(() => { if (selectedId) addRecent(selectedId); }, [selectedId]);

  // Global keys: Ctrl/⌘+K toggles Spotlight, "/" opens it, Escape closes the inspector.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setSpotlight((o) => !o);
      } else if (e.key === '/' && !spotlight && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(document.activeElement)) {
        e.preventDefault();
        setSpotlight(true);
      } else if (e.key === 'Escape' && !spotlight && route.id && KINDS[route.view] && !isEditable(document.activeElement)) {
        navigate(route.view);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, navigate, spotlight]);

  const onSpotlightSelect = useCallback((target, keepOpen) => {
    if (!keepOpen) setSpotlight(false);
    if (target.type === 'entity') openEntity(target.id);
    else if (target.type === 'prd') navigate('prd', target.sectionId);
    else if (target.type === 'view') navigate(target.view);
    else if (target.cmd === 'openPrd') navigate('prd');
    else if (target.cmd === 'lang') setLang(target.lang);
    else if (target.cmd === 'reload') api.refresh();
    else if (target.cmd === 'copyPath') navigator.clipboard?.writeText(state?.workspace ?? '');
  }, [openEntity, navigate, setLang, api, state?.workspace]);

  if (!mounted || (!state && !api.error)) return <Splash title={t('app.loading')}><span className="pulse">{t('app.connecting')}</span></Splash>;
  if (!state) {
    return <Splash title={t('app.serverDown')}>{t('app.serverDownHint', { cmd: <code dir="ltr">sherlock open</code> })}</Splash>;
  }
  if (!state.model) {
    return (
      <Splash title={t('app.noModel')}>
        {state.prd
          ? t('app.noModelPrdHint', { doc: <b><bdi>{state.prd.document}</bdi></b>, cmd: <code dir="ltr">sherlock create</code> })
          : t('app.noModelHint', { cmd: <code dir="ltr">/sherlock prd.docx</code> })}
      </Splash>
    );
  }

  const isKindView = !!KINDS[route.view];
  const openPrd = (sectionId, excerpt) => navigate('prd', sectionId, excerpt ? { hl: excerpt } : undefined);
  const closeInspector = () => navigate(route.view);
  const showInspector = selectedId && route.view !== 'prd';

  let content;
  if (route.view === 'prd') {
    content = (
      <PrdViewer prd={api.prd} analysis={state.analysis} sectionId={route.id} excerpt={route.query.hl}
        onSelectSection={(sid) => navigate('prd', sid)} onOpen={(id) => navigate(kindOfId(id), id)} />
    );
  } else if (route.view === 'feedback') {
    content = <FeedbackView state={state} onOpen={openEntity} onPatch={api.patchFeedback} onSend={api.sendFeedback} />;
  } else if (isKindView) {
    content = <EntityList key={route.view} kind={route.view} state={state} selectedId={selectedId} onOpen={openEntity} compact={!!showInspector} />;
  } else {
    content = <Overview state={state} navigate={(v) => navigate(v)} onOpen={openEntity} />;
  }

  return (
    <div className={`app ${spotlight ? 'spotlight-open' : ''}`}>
      <Header state={state} status={api.status} navigate={navigate} refresh={api.refresh} onSearch={() => setSpotlight(true)} />
      <div className="body">
        <Sidebar state={state} route={route} navigate={navigate} />
        <div className="workspace">
          <div className="crumbbar">
            <button type="button" className="back" aria-label={t('nav.back')} onClick={() => window.history.back()}><Icon name="chevronLeft" size={16} /></button>
            <span>{has(`nav.${route.view}`) ? t(`nav.${route.view}`) : t('nav.overview')}</span>
            {selectedId && <><span className="sep">/</span><bdi className="cur mono" dir="ltr">{selectedId}</bdi></>}
            {route.view === 'prd' && route.id && <><span className="sep">/</span><bdi className="cur mono" dir="ltr">§{route.id}</bdi></>}
          </div>
          <div className={`panes ${showInspector ? 'has-inspector' : ''}`}>
            <main className="pane" style={route.view === 'prd' ? { overflow: 'hidden' } : undefined}>{content}</main>
            {showInspector && (
              <Inspector key={selectedId} id={selectedId} state={state} byId={byId} onOpen={openEntity} onClose={closeInspector}
                openPrd={openPrd} sendFeedback={api.sendFeedback} patchFeedback={api.patchFeedback} />
            )}
          </div>
        </div>
      </div>
      {spotlight && <Spotlight state={state} prd={api.prd ?? state.prd} onClose={() => setSpotlight(false)} onSelect={onSpotlightSelect} />}
      {toast && (
        <div className="toast" role="status">
          <Icon name="refresh" size={15} />
          {t('toast.modelUpdated', { rev: toast.rev })}{toast.n ? ` · ${t('toast.itemsChanged', { count: toast.n })}` : ''}
        </div>
      )}
    </div>
  );
}
