import { archiveReceiver as receiver } from '@langboard/app-server';
import { archiveIssue } from './archive.mjs';
import { glitchtipApi } from './provider-api.mjs';
export { archiveStore, archiveHost, verifyArchiveEvent } from '@langboard/app-server';

export function archiveReceiver({ secret, store, host, resolveIssue, providerRequest = fetch }) {
  return receiver({ secret, store, host, cardType: 'issue', action: 'resolve_issue',
    resolveContext: async event => { const context = await resolveIssue(event); return context && { ...context, externalResourceId: String(context.issueId) }; },
    execute: context => archiveIssue(String(context.issueId), glitchtipApi(context.provider, providerRequest), { enabled: true }),
  });
}
