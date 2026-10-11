import {createSignalInbox, createSourceInbox as createScopedInbox, filterSignals} from '@langboard/app-panel/inbox';
export const provider = 'glitchtip';
export const title = { en: 'Issue status observations', ko: '이슈 상태 관측' };
export const visibleItems = (items, query, outcome, source = provider) => filterSignals(items, source, query, outcome);
export const createInbox = (session, changed, source = provider) => createSignalInbox(session, source, changed);
export const createSourceInbox = (session, changed, source) => createScopedInbox(session, source, changed);
