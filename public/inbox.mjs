import {createSignalInbox, filterSignals} from '@langboard/app-panel/inbox';
export const provider = 'glitchtip';
export const title = { en: 'Issue status observations', ko: '이슈 상태 관측' };
export const visibleItems = (items, query, outcome, source = provider) => filterSignals(items, source, query, outcome);
export const createInbox = (session, changed, source = provider) => createSignalInbox(session, source, changed);

// A selected source owns its cursor and request lifetime, never a shared history.
export function createSourceInbox(session, changed, source) {
  let inbox, stop;
  return {
    start() {
      if (inbox || session.signal.aborted) return;
      const abort = new AbortController();
      stop = () => abort.abort();
      inbox = createInbox({ ...session, signal: abort.signal }, state => changed({ ...state, source }), source);
      session.signal.addEventListener('abort', stop, { once: true });
      return inbox.load();
    },
    load(more = false) { return inbox?.load(more); },
    dispose() { stop?.(); if (stop) session.signal.removeEventListener('abort', stop); inbox = undefined; stop = undefined; },
  };
}
