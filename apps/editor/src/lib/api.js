'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

async function json(url, opts) {
  const res = await fetch(url, { cache: 'no-store', ...opts });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/**
 * Live connection to the local Sherlock server.
 * - loads /api/state (+ /api/prd once)
 * - listens on /api/events and refetches when .sherlock files change
 */
export function useSherlock() {
  const [state, setState] = useState(null);
  const [prd, setPrd] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting | live | offline
  const [error, setError] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const revRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await json('/api/state');
      setState(s);
      setError(null);
      return s;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  const refreshPrd = useCallback(async () => {
    try { setPrd(await json('/api/prd')); } catch { /* optional */ }
  }, []);

  useEffect(() => {
    refresh();
    refreshPrd();
    let es;
    let retry;
    const connect = () => {
      es = new EventSource('/api/events');
      es.addEventListener('hello', () => setStatus('live'));
      es.addEventListener('change', async (ev) => {
        const { files = [] } = JSON.parse(ev.data || '{}');
        if (files.some((f) => f.startsWith('prd'))) refreshPrd();
        const s = await refresh();
        const rev = s?.project?.revision ?? null;
        if (files.includes('model.json') && rev !== revRef.current && revRef.current !== null) {
          setLastEvent({ type: 'model', revision: rev, at: Date.now() });
        } else if (files.includes('feedback.json')) {
          setLastEvent({ type: 'feedback', at: Date.now() });
        }
        revRef.current = rev;
      });
      es.onerror = () => {
        setStatus('offline');
        es.close();
        retry = setTimeout(() => { setStatus('connecting'); connect(); refresh(); }, 2000);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [refresh, refreshPrd]);

  useEffect(() => {
    if (state && revRef.current === null) revRef.current = state.project?.revision ?? null;
  }, [state]);

  const sendFeedback = useCallback(async (body) => {
    const fb = await json('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    await refresh();
    return fb;
  }, [refresh]);

  const patchFeedback = useCallback(async (id, body) => {
    const fb = await json(`/api/feedback/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    await refresh();
    return fb;
  }, [refresh]);

  return { state, prd, status, error, lastEvent, refresh, sendFeedback, patchFeedback };
}
