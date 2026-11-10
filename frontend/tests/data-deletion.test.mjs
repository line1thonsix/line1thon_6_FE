import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { createAnalysisStore } from '../src/mocks/analysisStore.ts'
import { clearDeletedMockDrafts } from '../src/storage/dataDeletion.ts'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mockOwner = 'deletion-test-guest'
const origin = 'http://localhost:9841'
const question = '삭제 검증용 반복문의 마지막 값을 확인하고 싶어요'
const code = 'const deletionFixture = [1, 2, 3]'
const thought = '배열의 마지막 위치와 길이는 다르므로 반복 조건을 확인하고 작은 배열에서 인덱스별 값을 출력해서 비교해 볼게요.'
function storage() {
  const db = new Map()
  return { db, read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
}
function fixture(extra = {}) {
  let now = 1000
  const persistence = storage()
  const options = { ownerToken: mockOwner, origin, persistence, delayMs: 1, now: () => now, analysisDurationMs: 100, ...extra }
  const server = setupServer(...createChatHandlers(options)); server.listen({ onUnhandledRequest: 'error' })
  return { server, persistence, options, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: value => { now = value } }
}
async function req(path = '', method = 'GET', body, owner = mockOwner) {
  const r = await fetch(origin + '/api/chats' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Mock-Guest-Token': owner }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: r.status, body: r.status === 204 ? null : await r.json() }
}
async function create() {
  const r = await req('', 'POST', { question, code, type: 'DEBUGGING', clientRequestId: crypto.randomUUID() })
  assert.equal(r.status, 201); return r.body.id
}
async function waitFor(check) {
  const until = Date.now() + 1500
  while (!check()) { assert.ok(Date.now() < until, 'fixture started'); await new Promise(resolve => setTimeout(resolve, 2)) }
}
async function assertGone(id) {
  for (const path of ['', '/hints', '/analysis', '/result?resultId=forged', '/follow-ups', '/basic-learning/result?transitionId=forged']) assert.equal((await req('/' + id + path)).status, 404, path)
}

test('single deletion removes content, follow-ups and result access across reload while retaining another chat and content-free usage', async () => {
  const f = fixture()
  try {
    const id = await create(), keep = await create()
    assert.equal((await req('/' + id, 'DELETE', undefined, 'foreign-guest')).status, 404)
    assert.equal((await req('', 'DELETE', undefined, '')).status, 404)
    await req('/' + id + '/thoughts', 'POST', { thought, clientRequestId: 'submit' })
    f.tick(1200)
    const analysis = (await req('/' + id + '/analysis')).body
    assert.equal(analysis.status, 'DONE')
    await req('/' + id + '/result?resultId=' + analysis.resultId)
    assert.equal((await req('/' + id + '/follow-ups', 'POST', { question: '어떤 조건을 더 확인할까요?', clientRequestId: 'follow' })).status, 200)
    const usage = f.persistence.read('questionUsage')
    assert.equal((await req('/' + id, 'DELETE')).status, 204)
    await assertGone(id)
    assert.equal((await req('/' + id, 'DELETE')).status, 404)
    assert.deepEqual((await req()).body.items.map(row => row.id), [keep])
    const persisted = JSON.stringify([...f.persistence.db])
    assert.equal(persisted.includes(thought), false)
    assert.equal(persisted.includes('어떤 조건을 더 확인할까요?'), false)
    assert.deepEqual(f.persistence.read('questionUsage'), usage)
    f.reload(); await assertGone(id)
    assert.equal((await req('/' + keep)).status, 200)
  } finally { f.server.close() }
})

test('failure leaves all content intact; retry succeeds and empty all-delete is idempotent across reload', async () => {
  const f = fixture({ deletionScenario: () => 'error-once' })
  try {
    const id = await create()
    assert.equal((await req('', 'DELETE')).status, 503)
    assert.equal((await req('/' + id)).status, 200)
    assert.equal((await req('', 'DELETE')).status, 204)
    assert.equal((await req('', 'DELETE')).status, 204)
    f.reload(); await assertGone(id)
    assert.deepEqual((await req()).body, { items: [] })
    const persisted = JSON.stringify([...f.persistence.db])
    for (const text of [question, code, thought]) assert.equal(persisted.includes(text), false)
  } finally { f.server.close() }
})

test('another guest store cannot delete a foreign chat, and its all-delete cannot select the victim store', async () => {
  const f = fixture(), other = storage()
  try {
    const victim = await create()
    f.server.resetHandlers(...createChatHandlers({ ...f.options, persistence: other, ownerToken: 'other-guest' }))
    assert.equal((await req('/' + victim, 'DELETE')).status, 404)
    assert.equal((await req('?owner=victim', 'DELETE')).status, 404)
    assert.equal((await req('', 'DELETE', undefined, 'other-guest')).status, 204)
    f.reload()
    assert.equal((await req('/' + victim)).status, 200)
    assert.equal((await req()).body.items.length, 1)
  } finally { f.server.close() }
})

test('deleting pending analysis fences late status/results and leaves no job capable of committing', async () => {
  const f = fixture({ analysisStatusDelayMs: 45 })
  try {
    const id = await create()
    const submitted = await req('/' + id + '/thoughts', 'POST', { thought, clientRequestId: 'pending' })
    const late = req('/' + id + '/analysis')
    await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal((await req('/' + id, 'DELETE')).status, 204)
    assert.notEqual((await late).status, 200)
    const stale = createAnalysisStore({ persistence: f.persistence })
    assert.equal(stale.commitResult(id, submitted.body.analysis.jobId, 'late'), false)
    f.tick(9000); f.reload(); await assertGone(id)
    assert.equal(JSON.stringify([...f.persistence.db]).includes(thought), false)
  } finally { f.server.close() }
})

test('all-delete blocks in-flight question generation and clears orphan request fingerprints', async () => {
  const f = fixture({ delayMs: 60, deletionDelayMs: 1 })
  try {
    const late = req('', 'POST', { question, code, type: 'DEBUGGING', clientRequestId: 'creating' })
    await waitFor(() => f.persistence.read('requests')?.length)
    assert.equal((await req('', 'DELETE')).status, 204)
    assert.notEqual((await late).status, 201)
    f.reload(); assert.deepEqual((await req()).body.items, [])
    assert.equal(JSON.stringify([...f.persistence.db]).includes(question), false)
  } finally { f.server.close() }
})

test('deletion discards delayed BASIC publication and pending follow-up generation', async () => {
  const f = fixture({ basicResultDelayMs: 60, followUpDelayMs: 60 })
  try {
    const basic = await create()
    for (const level of [1, 2]) await req('/' + basic + '/hints', 'POST', { level })
    const transition = (await req('/' + basic + '/basic-learning', 'POST', { clientRequestId: 'basic' })).body
    const lateBasic = req('/' + basic + '/basic-learning/result?transitionId=' + transition.transitionId)
    await waitFor(() => f.persistence.read('basicResults')?.length)
    await req('/' + basic, 'DELETE'); assert.notEqual((await lateBasic).status, 200)
    const self = await create()
    await req('/' + self + '/thoughts', 'POST', { thought, clientRequestId: 'self' }); f.tick(1200)
    const lateFollow = req('/' + self + '/follow-ups', 'POST', { question: '삭제 뒤 남지 않을 질문', clientRequestId: 'late-follow' })
    await waitFor(() => f.persistence.read('followUpRequests')?.length)
    await req('/' + self, 'DELETE'); assert.equal((await lateFollow).status, 404)
    f.reload(); await assertGone(basic); await assertGone(self)
    assert.equal(JSON.stringify([...f.persistence.db]).includes('삭제 뒤 남지 않을 질문'), false)
  } finally { f.server.close() }
})

test('client cleanup removes only deleted Mock/editor keys and preserves API workspaces, other chats and unrelated apps', () => {
  const values = new Map()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { get length() { return values.size }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } })
  try {
    for (const id of ['a', 'b']) for (const prefix of ['deveil:thought-draft:v1:', 'deveil:demo:post-result:v1:', 'deveil:mock:hint-view:v1:']) values.set(prefix + id, JSON.stringify('draft'))
    values.set('deveil:mock:workspace:v1', JSON.stringify({ chatId: 'b' }))
    for (const key of ['deveil:api:workspace:v1', 'another-app', 'deveil:mock-server:v1:questionUsage']) values.set(key, '[]')
    assert.equal(clearDeletedMockDrafts('a'), false)
    assert.equal(values.has('deveil:thought-draft:v1:a'), false)
    assert.ok(values.has('deveil:thought-draft:v1:b'))
    assert.equal(clearDeletedMockDrafts(), true)
    for (const key of ['deveil:api:workspace:v1', 'another-app', 'deveil:mock-server:v1:questionUsage']) assert.ok(values.has(key))
    assert.equal(values.has('deveil:mock:workspace:v1'), false)
  } finally { if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage }
})

let vite, DeleteConfirmation, LearningHistory
before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ DeleteConfirmation } = await vite.ssrLoadModule('/src/components/layout/DeleteConfirmation.tsx'))
  ;({ LearningHistory } = await vite.ssrLoadModule('/src/components/history/LearningHistory.tsx'))
})
after(async () => { await vite?.close() })
test('Figma confirmation keeps cancel/delete, blocks duplicate action while busy, and has no fabricated success claim', () => {
  const render = extra => renderToStaticMarkup(createElement(DeleteConfirmation, { target: { kind: 'all' }, busy: false, error: false, onCancel() {}, onConfirm() {}, ...extra }))
  assert.ok(render().includes('모든 데이터를 삭제할까요?'))
  assert.ok(render({ target: { kind: 'chat', chatId: 'a' } }).includes('이 대화를 삭제할까요?'))
  assert.ok(render().includes('되돌릴 수 없어요.'))
  assert.equal((render({ busy: true }).match(/disabled=""/g) ?? []).length, 2)
  assert.ok(render({ error: true }).includes('role="alert"'))
  assert.equal(render().includes('삭제되었'), false)
  const history = renderToStaticMarkup(createElement(LearningHistory, { items: [{ id: 'a', question, progress: 'LOCKED', learningPath: null, createdAt: 1, updatedAt: 1 }], status: 'ready', error: '', onRetry() {}, onOpen() {}, onDelete() {} }))
  assert.ok(history.includes('대화 더보기'))
  assert.equal(/<button[^>]*>[\s\S]*?<button/.test(history.split('대화 열기')[1]?.split('</button>')[0] ?? ''), false)
})

test('production deletion adapter rejects before any network request, even if Mock flag is set', async () => {
  const production = await createServer({ logLevel: 'silent', define: { 'import.meta.env.DEV': false, 'import.meta.env.VITE_ENABLE_MOCKS': '"true"' }, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = () => { calls++; throw new Error('unexpected server request') }
  try {
    const { deleteMockData } = await production.ssrLoadModule('/src/api/dataDeletion.ts')
    await assert.rejects(deleteMockData('private-chat'), /MOCK_ONLY/)
    await assert.rejects(deleteMockData(), /MOCK_ONLY/)
    assert.equal(calls, 0)
  } finally { globalThis.fetch = original; await production.close() }
})
