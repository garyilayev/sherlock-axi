'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSherlock } from './lib/api.js';
import { useHashRoute } from './lib/router.js';
import { KINDS, kindOfId, indexModel } from './lib/meta.js';
import { Header, Sidebar, VIEW_LABEL } from './components/Chrome.jsx';
import { Icon, Logo } from './components/ui.jsx';
import Overview from './components/Overview.jsx';
import EntityList from './components/EntityList.jsx';
import Inspector from './components/Inspector.jsx';
import PrdViewer from './components/PrdViewer.jsx';
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

export default function App() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const api = useSherlock();
  const [route, navigate] = useHashRoute();
  const [toast, setToast] = useState(null);
  const { state } = api;
  const byId = useMemo(() => indexModel(state?.model), [state?.model]);

  // Toast when Claude pushes a new revision.
  useEffect(() => {
    if (api.lastEvent?.type !== 'model') return;
    const ch = state?.project?.lastChange;
    const n = ch ? (ch.added?.length ?? 0) + (ch.modified?.length ?? 0) + (ch.removed?.length ?? 0) : 0;
    setToast(`Claude updated the guide — rev ${api.lastEvent.revision}${n ? ` · ${n} item${n === 1 ? '' : 's'} changed` : ''}`);
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
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

  // Escape closes the inspector.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && route.id && KINDS[route.view] && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) navigate(route.view);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, navigate]);

  if (!mounted || (!state && !api.error)) return <Splash title="Opening Sherlock…"><span className="pulse">Connecting to the local workspace</span></Splash>;
  if (!state) {
    return (
      <Splash title="Local server not reachable">
        Start it from your project with <code>sherlock open</code>.
      </Splash>
    );
  }
  if (!state.model) {
    return (
      <Splash title="No QA model yet">
        {state.prd ? <>PRD <b>{state.prd.document}</b> is extracted. Claude will create the model with <code>sherlock create</code>.</> : <>Run <code>/sherlock prd.docx</code> in Claude Code.</>}
      </Splash>
    );
  }

  const selectedId = route.id && kindOfId(route.id) ? route.id : null;
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
    <div className="app">
      <Header state={state} status={api.status} onOpen={(id) => navigate(kindOfId(id), id)} navigate={navigate} refresh={api.refresh} />
      <div className="body">
        <Sidebar state={state} route={route} navigate={navigate} />
        <div className="workspace">
          <div className="crumbbar">
            <button type="button" className="back" aria-label="Back" onClick={() => window.history.back()}><Icon name="chevronLeft" size={16} /></button>
            <span>{VIEW_LABEL[route.view] ?? 'Overview'}</span>
            {selectedId && <><span className="sep">/</span><span className="cur mono">{selectedId}</span></>}
            {route.view === 'prd' && route.id && <><span className="sep">/</span><span className="cur mono">§{route.id}</span></>}
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
      {toast && <div className="toast" role="status"><Icon name="refresh" size={15} />{toast}</div>}
    </div>
  );
}
