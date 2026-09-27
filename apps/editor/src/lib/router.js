'use client';
import { useCallback, useEffect, useState } from 'react';

// Hash routes: #/<view>[/<id>]   e.g. #/testCases/TC-023, #/prd/3.8
export function parseHash(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
  const [view = 'overview', ...rest] = path.split('/');
  const id = rest.length ? decodeURIComponent(rest.join('/')) : null;
  return { view: view || 'overview', id, query: Object.fromEntries(new URLSearchParams(query)) };
}

export function hrefFor(view, id, query) {
  const q = query ? `?${new URLSearchParams(query)}` : '';
  return `#/${view}${id ? `/${encodeURIComponent(id)}` : ''}${q}`;
}

export function useHashRoute() {
  const [route, setRoute] = useState({ view: 'overview', id: null, query: {} });
  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const navigate = useCallback((view, id = null, query) => {
    window.location.hash = hrefFor(view, id, query);
  }, []);
  return [route, navigate];
}
