import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { readConversationSummaries, withDemoReflections } from '../src/api/historyState.ts'
import { filterHistory, groupHistory, shouldRefreshHistory } from '../src/data/history.ts'
import { createDemoNotes } from '../src/storage/postResultDemo.ts'
import { subscribeHistoryChange } from '../src/storage/historyEvents.ts'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const origin = 'http://localhost:9876'
const question = '반복문의 마지막 값이 왜 없을까요?'
const thought = '배열의 마지막 위치와 길이는 다르므로 반복 조건을 확인하고 작은 배열에서 인덱스별 값을 출력해서 비교해 볼게요.'
const summary = (id, extra = {}) => ({ id, question, learningPath: null, progress: 'LOCKED', createdAt: 1, updatedAt: 1, ...extra })
const noPrivateContent = value => {
  for (const key of ['referenceAnswer', 'findings', 'thought', 'code', 'choices', 'exampleSentence', 'steps', 'exampleCode', 'score']) assert.equal(JSON.stringify(value).includes('"' + key + '"'), false, key)
}
test('history refreshes on entry or a newly created background chat, not on background restore or ordinary rerender', () => {
  const history = { historyActive: true, stage: 'restoring' }
  assert.equal(shouldRefreshHistory(history, { ...history, stage: 'locked', chatId: 'a' }), false)
  assert.equal(shouldRefreshHistory({ ...history, stage: 'creating' }, { ...history, stage: 'locked', chatId: 'a' }), true)
  assert.equal(shouldRefreshHistory({ ...history, historyActive: false }, history), true)
  assert.equal(shouldRefreshHistory({ ...history, historyActive: false }, { historyActive: false, stage: 'locked', chatId: 'a' }), true)
  assert.equal(shouldRefreshHistory(history, history), false)
})
function fixture(extra = {}) {
  let now = 1000
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, persistence, delayMs: 1, now: () => now, analysisDurationMs: 100, ...extra }
  const server = setupServer(...createChatHandlers(options)); server.listen({ onUnhandledFrame: 'error' })
  return { server, db, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: value => { now = value } }
}
async function get(path = '/api/chats') { const response = await fetch(origin + path); return { status: response.status, body: await response.json() } }
async function post(path, body) { const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() } }
async function create(text = question) {
  const r = await post('/api/chats', { question: text, code: '', type: 'DEBUGGING', clientRequestId: crypto.randomUUID() })
  assert.equal(r.status, 201); return r.body
}

test('history decoder validates identities/states/dates and drops every extra answer, analysis and code field', () => {
  const raw = summary('a', { referenceAnswer: 'never preload', findings: [{}], thought: 'private', code: 'secret' })
  const items = readConversationSummaries({ items: [raw] })
  noPrivateContent(items); assert.equal(items[0].question, question)
  for (const change of [{ id: '' }, { question: '' }, { question: 'a'.repeat(2001) }, { progress: 'DONE' }, { learningPath: 'OTHER' }, { createdAt: -1 }, { updatedAt: NaN }, { updatedAt: 8640000000000001 }]) assert.throws(() => readConversationSummaries({ items: [summary('a', change)] }))
  assert.throws(() => readConversationSummaries({ items: [summary('a'), summary('a')] }))
  for (const raw of [null, {}, { items: null }, { items: [null] }]) assert.throws(() => readConversationSummaries(raw))
  const secret = 'sk-' + 'a'.repeat(40)
  assert.equal(readConversationSummaries({ items: [summary('a', { question: secret })] })[0].question, '[REDACTED]')
})

test('latest saved reflection replaces the old preview; drafts, feedback and locked records do not leak into previews', () => {
  let saved = null
  const c = createDemoNotes('a', true, { read: () => saved, write: next => { saved = structuredClone(next); return true } })
  let changes = 0; const unsubscribe = subscribeHistoryChange(() => { changes++ })
  const items = [summary('a', { learningPath: 'SELF', progress: 'DONE' }), summary('b')]
  try {
    c.open('reflection'); c.change('아직 저장하지 않은 회고')
    assert.equal(withDemoReflections(items, () => saved)[0].reflection, null)
    c.submit(); c.open('reflection'); c.change('다시 확인할 조건을 먼저 정리했어요.'); c.submit()
    c.open('feedback'); c.change('이 의견은 회고가 아니에요.'); c.submit()
    const merged = withDemoReflections(items, () => saved)
    assert.equal(merged[0].reflection, '다시 확인할 조건을 먼저 정리했어요.')
    assert.equal(merged[0].updatedAt, saved.savedAt.reflection)
    assert.equal(merged[1].reflection, null)
    assert.equal(changes, 2)
    assert.equal(JSON.stringify(merged).includes('이 의견은'), false)
    const restored = createDemoNotes('a', true, { read: () => saved, write: () => true })
    assert.equal(restored.getState().saved.reflection, merged[0].reflection)
  } finally { unsubscribe() }
})

test('filters separate DONE SELF from BASIC and pending/failed; local date groups are sorted newest first', () => {
  const now = new Date(2026, 10, 10, 12)
  const rows = [
    summary('old', { updatedAt: new Date(2026, 10, 8, 16).getTime(), reflection: null }),
    summary('basic', { learningPath: 'BASIC', updatedAt: new Date(2026, 10, 9, 18).getTime(), reflection: '배웠어요' }),
    summary('done', { learningPath: 'SELF', progress: 'DONE', updatedAt: now.getTime(), reflection: null }),
    summary('pending', { learningPath: 'SELF', progress: 'PENDING', updatedAt: now.getTime(), reflection: null }),
    summary('failed', { learningPath: 'SELF', progress: 'FAILED', updatedAt: now.getTime(), reflection: null }),
  ]
  assert.deepEqual(filterHistory(rows, 'SELF').map(row => row.id), ['done'])
  assert.deepEqual(filterHistory(rows, 'BASIC').map(row => row.id), ['basic'])
  assert.equal(filterHistory(rows, 'ALL').length, 5)
  assert.deepEqual(groupHistory(rows, now).map(group => group.label), ['오늘', '어제', '2026.11.08'])
  assert.equal(groupHistory([{ ...rows[0], updatedAt: 0 }], now)[0].label, '이전 기록')
})

test('MSW history starts empty, persists multiple chats, preserves drafts/locks and never returns answer/result bodies', async () => {
  const f = fixture()
  try {
    assert.deepEqual((await get()).body, { items: [] })
    const first = await create(); f.tick(2000); const second = await create('데이터가 도착하는 시점은 언제인가요?')
    f.reload()
    const list = await get(); assert.equal(list.status, 200); noPrivateContent(list.body)
    const rows = readConversationSummaries(list.body)
    assert.deepEqual(rows.map(row => row.id), [second.id, first.id])
    assert.equal(rows[1].progress, 'LOCKED'); assert.equal(rows[1].learningPath, null)
    const path = '/api/chats/' + first.id
    assert.equal((await get(path)).body.id, first.id)
    assert.equal((await get(path + '/result?resultId=forged')).status, 403)
    assert.equal((await get('/api/chats/unknown')).status, 404)
    assert.equal(JSON.stringify([...f.db]).includes('referenceAnswer'), false)
    // A new mock owner/store does not inherit another owner's chat list.
    f.server.resetHandlers(...createChatHandlers({ origin, delayMs: 1 }))
    assert.deepEqual((await get()).body.items, [])
    assert.equal((await get(path)).status, 404)
  } finally { f.server.close() }
})

test('history tracks pending, failed, retry and DONE SELF without unlocking list data; reopening keeps the server job', async () => {
  let scenario = 'always-fail'
  const f = fixture({ analysisScenario: () => scenario })
  try {
    const chat = await create(), path = '/api/chats/' + chat.id
    const submitted = await post(path + '/thoughts', { thought, clientRequestId: 'thought' }); assert.equal(submitted.status, 202)
    let list = (await get()).body; noPrivateContent(list); assert.equal(list.items[0].progress, 'PENDING')
    f.tick(1200); f.reload(); list = (await get()).body
    assert.equal(list.items[0].progress, 'FAILED'); assert.equal(list.items[0].learningPath, 'SELF'); noPrivateContent(list)
    const failed = (await get(path + '/analysis')).body
    assert.equal((await get(path)).body.thought, thought)
    scenario = 'success'
    assert.equal((await post(path + '/analysis/retry', { jobId: failed.jobId, clientRequestId: 'retry' })).status, 202)
    f.tick(1300); f.reload(); list = (await get()).body
    assert.equal(list.items[0].progress, 'DONE'); noPrivateContent(list)
    const done = (await get(path + '/analysis')).body
    const restored = (await get(path)).body
    assert.equal(restored.analysis.jobId, done.jobId); assert.equal(restored.thought, thought)
    assert.equal((await get(path + '/result?resultId=' + done.resultId)).status, 200)
  } finally { f.server.close() }
})

test('BASIC history survives reload and opens only through the existing authorized F-09/F-12 path', async () => {
  const f = fixture()
  try {
    const chat = await create(), path = '/api/chats/' + chat.id
    for (const input of [{ level: 1 }, { level: 2 }]) assert.equal((await post(path + '/hints', input)).status, 200)
    const transition = (await post(path + '/basic-learning', { clientRequestId: 'basic' })).body
    f.reload()
    const list = (await get()).body; noPrivateContent(list); assert.equal(list.items[0].learningPath, 'BASIC')
    const restored = (await get(path)).body
    assert.equal(restored.basicLearning.transitionId, transition.transitionId)
    assert.equal((await get(path + '/basic-learning/result?transitionId=' + transition.transitionId)).status, 200)
    assert.equal((await get(path + '/result?resultId=forged')).status, 403)
  } finally { f.server.close() }
})

test('history read failure retries without creating or losing chats; older records without timestamps remain visible', async () => {
  const f = fixture({ historyScenario: () => 'error-once' })
  try {
    const chat = await create()
    assert.equal((await get()).status, 503)
    const second = await get(); assert.equal(second.status, 200); assert.equal(second.body.items.length, 1); assert.equal(second.body.items[0].id, chat.id)
    f.db.delete('historyMetadata'); f.reload()
    const third = await get() // error-once resets per worker, not a mutation
    assert.equal(third.status, 503)
    const legacy = readConversationSummaries((await get()).body)[0]
    assert.equal(legacy.createdAt, 0); assert.equal(legacy.updatedAt, 0); assert.equal(legacy.id, chat.id)
  } finally { f.server.close() }
})

let vite, LearningHistory, Sidebar
before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ LearningHistory } = await vite.ssrLoadModule('/src/components/history/LearningHistory.tsx'))
  ;({ Sidebar } = await vite.ssrLoadModule('/src/components/layout/Sidebar.tsx'))
})
after(async () => { await vite?.close() })

test('Figma history renders empty/loading/error separately, three filters, safe cards and actionable recent questions', () => {
  const props = { items: [], status: 'ready', error: '', onOpen() {}, onRetry() {} }
  const render = extra => renderToStaticMarkup(createElement(LearningHistory, { ...props, ...extra }))
  assert.ok(render().includes('아직 기록이 없어요'))
  assert.ok(render({ status: 'loading' }).includes('학습 기록을 불러오고 있어요'))
  assert.equal(render({ status: 'loading' }).includes('아직 기록이 없어요'), false)
  assert.ok(render({ status: 'error', error: '연결 실패' }).includes('다시 불러오기'))
  const rows = [{ ...summary('a', { learningPath: 'SELF', progress: 'DONE' }), reflection: '다음에는 조건을 확인할게요.' }]
  const html = render({ items: rows })
  assert.ok(html.includes('학습 기록 필터')); assert.ok(html.includes('기초 학습')); assert.ok(html.includes('비교 완료'))
  assert.ok(html.includes('다음에는 조건을 확인할게요.')); assert.ok(html.includes(question + ' 대화 열기'))
  assert.equal(html.includes('도움받아 학습</'), false)
  const sidebar = renderToStaticMarkup(createElement(Sidebar, { recent: rows, historyActive: true, currentChatId: 'a', onCollapse() {}, onNewChat() {}, onNotice() {}, onHistory() {}, onOpenChat() {} }))
  assert.ok(sidebar.includes('최근 대화')); assert.ok(sidebar.includes(question)); assert.ok(sidebar.includes('aria-current="page"'))
  assert.equal(sidebar.includes('다음 단계에서 제공할 예정이에요.</button>'), false)
})
