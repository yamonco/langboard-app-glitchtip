import {createSignalInbox, filterSignals} from '@langboard/app-panel/inbox';
export const provider = 'glitchtip';
export const title = { en: 'Issue status observations', ko: '이슈 상태 관측' };
export const visibleItems = (items, query, outcome) => filterSignals(items, provider, query, outcome);
export const createInbox = (session, changed) => createSignalInbox(session, provider, changed);
