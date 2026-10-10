import { createInbox, visibleItems, title } from './inbox.mjs';
export function createPanel(widgets, session) {
  const { React, Button, Badge, Input } = widgets;
  const h = React.createElement;
  const ko = session.context.language.startsWith('ko');
  const text = (en, kr) => ko ? kr : en;
  const statusLabel = value => ko ? ({success: '성공', succeeded: '성공', failure: '실패', failed: '실패', queued: '대기', started: '시작', cancelled: '취소', resolved: '해결', unresolved: '미해결', ignored: '무시', unknown: '미상', conflict: '근거 충돌'}[value] || value) : value;
  function Panel() {
    const [state, setState] = React.useState({ items: [], nextCursor: null, busy: false, error: '' });
    const [query, setQuery] = React.useState(typeof session.state?.query === 'string' ? session.state.query : '');
    const [outcome, setOutcome] = React.useState(typeof session.state?.outcome === 'string' ? session.state.outcome : '');
    const inbox = React.useMemo(() => createInbox(session, setState), []);
    React.useEffect(() => { void inbox.load(); }, [inbox]);
    function filters(nextQuery, nextOutcome) { setQuery(nextQuery); setOutcome(nextOutcome); session.saveState({ query: nextQuery, outcome: nextOutcome }); }
    const rows = visibleItems(state.items, query, outcome);
    const outcomes = [...new Set(state.items.map(item => item.conflict ? 'conflict' : item.outcome || 'unknown'))];
    return h('main', { className: 'flex flex-col gap-3 p-3' },
      h('h1', { className: 'text-lg font-semibold' }, title[ko ? 'ko' : 'en']),
      h('p', { className: 'text-sm' }, text('Authorized inbox observations. Refresh to request current evidence.', '권한이 있는 수신함 기록입니다. 새로고침으로 최신 근거를 요청합니다.')),
      h('label', null, text('Search', '검색'), h(Input, { type: 'search', value: query, onChange: e => filters(e.target.value, outcome), className: 'w-full', placeholder: text('Resource, ID or commit', '리소스, ID 또는 커밋') })),
      h('label', null, text('Status', '상태'), h('select', { value: outcome, onChange: e => filters(query, e.target.value), className: 'select w-full border rounded bg-background text-foreground p-2' }, h('option', { value: '' }, text('All', '전체')), ...outcomes.map(value => h('option', { key: value, value }, statusLabel(value))))),
      h(Button, { disabled: state.busy, onClick: () => void inbox.load() }, text('Refresh', '새로고침')),
      state.busy && h('p', { role: 'status' }, text('Loading…', '불러오는 중…')),
      state.error && h('p', { role: 'alert' }, text('Read failed: ', '조회 실패: ') + state.error),
      !state.busy && !rows.length && h('p', { role: 'status' }, text('No matching inbox records.', '일치하는 수신함 기록이 없습니다.')),
      h('ul', { className: 'flex flex-col gap-3' }, ...rows.map((item, index) => h('li', { key: item.signal_uid || [item.external_id, item.commit_sha, index].join(':'), className: 'border rounded p-3' },
        h('strong', null, item.resource_name || item.external_id),
        h('div', null, h(Badge, { variant: 'secondary' }, item.conflict ? text('Conflicting evidence', '근거 충돌') : statusLabel(item.outcome) || text('Unknown', '미상'))),
        h('p', null, item.event_type + ' · ' + item.external_id),
        item.commit_sha && h('p', null, text('Commit: ', '커밋: ') + item.commit_sha),
        h('p', null, text('Time: ', '시각: ') + String(item.occurred_at ?? '') + ' · ' + (item.time_basis === 'observation' ? text('Observed', '관측') : text('Occurred', '발생')))))),
      state.nextCursor && h(Button, { disabled: state.busy, onClick: () => void inbox.load(true) }, text('Load more', '더 보기')));
  }
  return Panel;
}
