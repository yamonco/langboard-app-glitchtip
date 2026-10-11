# GlitchTip panel

## Optional workflow declaration

Generate `node server.mjs --manifest --workflow-cards` for a separately reviewed
schema v2 profile with `cards.read`, `cards.create`, `events.receive`, the issue
lifecycle policy and the configured public data origin. Default `/manifest.json`
and CLI manifest stay read-only. Instance approval, owning connection/resource
selection and board grants remain required. A declaration does not start the
receiver or enable issue resolution; explicit archive consent is separate.

## Optional issue archive adapter

`archive.mjs` declares disabled-by-default archive synchronization and a resolver
against a caller-owned authenticated `readIssue`/`resolveIssue` adapter. It checks
the same issue identity and confirms resolved state after writing. Already
resolved issues do not repeat writes; uncertain writes return unknown. Archived
card restoration does not unresolve the issue. Events and recurrence are retained.
`provider-api.mjs` now supplies a caller-owned authenticated HTTP adapter:
`glitchtipApi({ origin, token })`. It uses the
[GlitchTip v6.2.6 issue API](https://gitlab.com/glitchtip/glitchtip-backend/-/blob/v6.2.6/apps/issue_events/api/issues.py):
`GET /api/0/issues/{id}/` and `PUT` with `{ "status": "resolved" }`.
The exact HTTPS origin and token stay server-side. Redirects and automatic retries
are disabled, requests have a 15-second timeout, and issue identifiers are bounded.
Use it with `archiveIssue(issueId, adapter, { enabled: true })` only after the host
has validated the current owned card and explicit archive synchronization consent.
The current signal panel does not call this handler. To enable the server-only
archive endpoint, construct `archiveReceiver` with the shared SDK's durable store,
configured host connection, signing secret and trusted per-issue mapping, then
pass it as `panelServer(config, { receiveArchive })`. This opens only
`POST /events/archive`, bounded to 64 KiB; the default CLI does not enable it.
Settings, permissions and real-provider acceptance remain pending. Provider tests
use controlled HTTP responses; they do not claim a deployed account was changed.

Standalone third party Langboard panel service. Node 22.13 or newer; no core checkout, React installation, copied theme, or browser provider credentials. The vendored npm SDK package version 0.2.3, including its signal request channel, provides the browser bridge. The separate vendored @langboard/app-server 0.1.1 provides server-only archive processing and is never exposed as a browser asset.

```sh
npm ci
HOST_ORIGIN=https://board.example PUBLIC_URL=https://panel.example PORT=8780 npm start
HOST_ORIGIN=https://board.example PUBLIC_URL=https://panel.example npm run manifest --silent > manifest.json
npm test
```

`HOST_ORIGIN` is the exact approved host origin. `PUBLIC_URL` is the deployed HTTPS panel origin; HTTPS termination may be handled by a reverse proxy. `HOST` defaults to loopback; set `HOST=0.0.0.0` in a container. `PORT` defaults to 8780. Local development defaults to host `http://127.0.0.1:5173` and declaration URL `https://panel.example`; configure a real public URL before approval. The manifest is also available at `/manifest.json`. No provider credentials or authenticated API endpoints are served here.

Register the generated external declaration (`glitchtip-panel`) for instance approval, then grant board panel rendering and explicitly check the separate signal read consent checkbox. Rendering consent alone cannot read signals. This companion panel requires an existing authorized provider connection, eligible board resource bindings and the native provider read/resource grants, in addition to the external panel read consent. External panel consent never creates provider authority. Provider onboarding remains a host responsibility. The host must support `session.request('signals.list', {provider: 'glitchtip', after?: cursor})` and supply its actual React, Button, Badge, Input and mount widget exports. The SDK imports from `/sdk/index.mjs`; the server exposes the installed package file with public module CORS for an opaque iframe. Host styling and theme follow automatically through the SDK.

GlitchTip shows issue status observations from authorized inbox records, with text and status filters, manual refresh, and cursor pagination. It requests on opening and on explicit actions; there is no polling. Disposable search/status filters use session state. Abort cleanup releases the mounted React tree; SDK request timeout and disposal cancel pending work. Inbox semantics exclude signals already linked to visible cards and may return empty pages with a next cursor. Times retain source values and observation/event basis; they are evidence timestamps, not an assertion of current provider state.

Unsupported mutations: PR merge, deployment execution, issue resolution, card creation and provider configuration. No pull request API is available; this panel displays inbox evidence only. It sends no synthetic GlitchTip events. Read authorization, provider ingestion, real deployed host integration, light/dark behavior and browser lifecycle acceptance must be verified in the target deployment; Node checks validate service routes, headers, SDK availability, declarations and request/filter/pagination/abort contracts, and do not establish browser or production proof.

Public static assets permit CORS `*` without credentials. CSP frame ancestors is limited to the configured host. Exact route allowlisting excludes arbitrary files. Deploy this repository independently with its package tarball and lockfile; run `npm ci` before starting.

Local browser verification used the real compiled host widget module and opaque iframe lifecycle with disposable sample inbox records. It confirmed dark theme changes, filters, and denial clearing prior data; it did not exercise a deployed account or real provider ingestion.

Panel declaration 0.1.1 explicitly limits signal_sources to glitchtip. Approve the newer declaration and review board signal consent again on SDK 0.2.20 hosts. The declaration neither grants provider account access nor installs an adapter. Inbox state remains independent from app-owned cards and HITL.


## Serving an optional workflow declaration

The default HTTP `/manifest.json` and `--manifest` output remain the read-only
signal inbox profile. Use `--workflow-cards` for both generation and service
startup when offering app-owned workflow cards:

```sh
npm run manifest --silent -- --workflow-cards > workflow-manifest.json
npm start -- --workflow-cards
```

Programmatic callers use `panelServer(config, { workflowCards: true })`. The
HTTP declaration is generated at startup from that same explicit profile.
These flags offer capabilities for approval; they do not register an app,
create a card, grant consent, connect a provider or activate external actions.

GlitchTip rejects the interaction profile until its interaction receiver is
implemented. Archive receiver injection is a separate server composition;
starting a workflow profile alone does not enable `/events/archive`.


## Explicit issue observations

`signals.mjs` runs in the external server and uses `glitchtipApi.readIssue`,
whitelisting ID, project, status and timestamps. `observeIssue` requires a trusted
project/board/resource mapping, explicit observation time, server credentials
and an awaited `saveEnvelope` callback. Persist that envelope before sending it.
A lost response must be reconciled by explicitly resubmitting the same envelope;
calling observe again creates a new observation identity. No polling, automatic
retry, card creation, triage, human approval or workflow transition is performed.

`--publish-signals` offers the finite `issue.status_observed` signal policy under
app version 0.2.1 and `signals.publish` consent. It is independent from
`--workflow-cards`. Approval, native inbound connection credentials, resource
selection and board consent are required before publication. This declaration
adds the external app's own signal source. When that profile is enabled, the
panel receives the declared source list from `/config.mjs` and lets the user
select `glitchtip` or `glitchtip-panel`; each source has an independent cursor,
bounded history and abort lifetime. A source change cannot let a late response
from the previous source overwrite the new view. This selector does not grant
signal consent or provider authority; the host still enforces both.

The shared server SDK is pinned at 0.1.1. It signs the exact bounded JSON bytes,
uses a configured HTTPS host origin, rejects redirects and does not retry unknown
publication. Provider credentials and the native host credential are separate.
No private diagnostics or original issue body is sent to Langboard. Node tests
use provider/host test doubles, not a production GlitchTip account.

A deployed durable observation service, actual provider/host persistence readback and browser acceptance remain integration work. The tests above use local HTTP and provider/host test doubles.

The source-scoped pager comes from panel SDK 0.2.3. Source switching resets cursors, suppresses late state and removes abort listeners; no polling is added. Host permission checks remain authoritative.

## Durable manual observation and recovery

The optional operator command is a real server-side entry point for one issue
observation. It uses the existing provider adapter and signed server SDK. It
creates no card, requests no approval, changes no workflow and adds no polling.
The administrator must first approve the `--publish-signals` declaration, create
an authorized native inbound connection, select the project resource and grant
board signal publication. Configuration is private operator data, not a public
manifest or a source-controlled company mapping:

```json
{
  "hostOrigin": "https://board.example",
  "providerOrigin": "https://errors.example",
  "scope": {
    "boardUID": "<board uid>", "resourceUID": "<selected resource uid>",
    "projectId": "<provider project id>", "projectSlug": "<provider slug>",
    "appRevision": "<current app revision>", "bindingRevision": "<current binding revision>"
  }
}
```

Inject `LANGBOARD_APP_TOKEN` and the separate `GLITCHTIP_READ_TOKEN` through the
operator secret mechanism. Do not put tokens in the config or command arguments.
The config and saved envelope are limited to 16 KiB. A private existing directory
on durable Unix storage is required; file creation uses exclusive mode `0600`
and flushes the file and directory before publication.

```sh
node observation.mjs observe /private/app-config.json /private/issue-observation.json 42 2026-10-10T00:02:00Z
node observation.mjs resend /private/app-config.json /private/issue-observation.json
```

Supply the actual observation time. The first command reads the provider once,
stores only whitelisted metadata, then publishes. It refuses to overwrite an
existing envelope. A lost receipt leaves that file for explicit reconciliation;
`resend` publishes the same event identity and bytes without reading the provider
again. The saved board/resource and approval revisions must still match the
private config; changed mapping requires a fresh observation, not retargeting.
The host independently checks current authority and handles duplicate events.
Output contains only the native signal UID and duplicate flag; errors omit
provider responses and credentials. Partial or malformed files are rejected.

Tests exercise real temporary file persistence and recovery with provider/host
transport doubles. Actual provider access, deployed durable storage, native
signal readback and browser integration are still separate acceptance gates.
