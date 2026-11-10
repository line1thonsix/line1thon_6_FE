import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { createAnalysisStore } from '../src/mocks/analysisStore.ts'
import { readRestoredChat } from '../src/api/restoreChat.ts'
import { readThoughtDraft, toggleChoice, thoughtSubmission, manualThought } from '../src/api/thoughtDraft.ts'
import { watchAnalysis } from '../src/api/watchAnalysis.ts'

const origin = 'http://localhost:9879'
const thought = '배열의 마지막 위치와 길이를 나누어 확인하고 작은 배열에서 인덱스별 실제 값을 출력해서 비교해 볼게요.'
const edited = '먼저 반복 조건을 수정한 뒤 비어 있는 배열과 마지막 위치에서도 예상한 결과가 나오는지 직접 검증해 보겠습니다.'
function fixture(extra = {}) {
  let now = 1000
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, delayMs: 1, now: () => now, analysisDurationMs: 100, persistence, ...extra }
  const server = setupServer(...createChatHandlers(options)); server.listen({ onUnhandledFrame: 'error' })
  const call = async (path, body) => {
    const response = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  return { server, db, call, tick: amount => { now += amount }, reload: () => server.resetHandlers(...createChatHandlers(options)),
    create: async () => { const r = await call('/api/chats', { question: '반복문의 마지막 값이 왜 없을까요?', code: 'const a = [1, 2]', type: 'DEBUGGING', clientRequestId: crypto.randomUUID() }); assert.equal(r.status, 201); return r.body },
  }
}
const target = (jobId, learningPath = 'SELF', clientRequestId = crypto.randomUUID()) => ({ jobId, learningPath, clientRequestId })
async function submit(f, path, text = thought) {
  const request = { thought: text, clientRequestId: crypto.randomUUID() }
  const r = await f.call(path + '/thoughts', request); assert.equal(r.status, 202)
  return { receipt: r.body, request }
}
async function basic(f, path) {
  for (const level of [1, 2]) assert.equal((await f.call(path + '/hints', { level })).status, 200)
  const request = { clientRequestId: crypto.randomUUID() }
  const r = await f.call(path + '/basic-learning', request); assert.equal(r.status, 202)
  return { transition: r.body, request }
}
function noResults(value) {
  const raw = JSON.stringify(value)
  for (const field of ['referenceAnswer', 'findings', 'resultId', 'exampleCode', 'comparison']) assert.equal(raw.includes('"' + field + '"'), false, field)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('cancel revokes a generation; late commits never validate/save results, repeated starts retain attempt and get new IDs', () => {
  let now = 0, validated = 0
  const store = createAnalysisStore({ now: () => now, durationMs: 100, validateResult: () => { validated++; return true } })
  const first = store.start('a')
  assert.equal(store.cancel('a', first.jobId), 'CANCELLED')
  assert.equal(store.commitResult('a', first.jobId, 'late'), false); assert.equal(validated, 0)
  now = 500; assert.equal(store.get('a'), null)
  const second = store.start('a'); assert.equal(second.attempt, 1); assert.notEqual(second.jobId, first.jobId)
  assert.equal(store.commitResult('a', first.jobId, 'late-again'), false)
  assert.equal(store.get('a').jobId, second.jobId)
  for (let i = 0; i < 8; i++) { const current = store.get('a'); assert.equal(store.cancel('a', current.jobId), 'CANCELLED'); assert.equal(store.start('a').attempt, 1) }
  assert.equal(validated, 0)
})

test('completion first wins; cancelling attempt two preserves the prior failure and three-failure cap', () => {
  let now = 0, scenario = 'always-fail'
  const store = createAnalysisStore({ now: () => now, durationMs: 100, scenario: () => scenario })
  const first = store.start('a'); now = 200; assert.equal(store.get('a').status, 'FAILED')
  const second = store.retry('a', { jobId: first.jobId, clientRequestId: 'r1' })
  store.cancel('a', second.jobId); assert.equal(store.start('a').attempt, 2)
  now = 400; const failed = store.get('a'); assert.equal(failed.status, 'FAILED')
  store.retry('a', { jobId: failed.jobId, clientRequestId: 'r2' }); now = 600
  assert.equal(store.get('a').attempt, 3)
  assert.throws(() => store.retry('a', { jobId: store.get('a').jobId, clientRequestId: 'r3' }), error => error.code === 'ATTEMPTS_EXHAUSTED')
  scenario = 'success'; const other = store.start('b'); now = 700
  assert.equal(store.cancel('b', other.jobId), 'COMPLETED'); assert.equal(store.get('b').status, 'DONE')
})

test('SELF cancellation restores editable draft, persists lock, keeps question/code and starts a fresh analysis after edit', async () => {
  const f = fixture()
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { receipt, request } = await submit(f, path)
    const cancellation = target(receipt.analysis.jobId)
    const replies = await Promise.all([f.call(path + '/analysis/cancel', cancellation), f.call(path + '/analysis/cancel', cancellation)])
    assert.deepEqual(replies.map(r => r.status), [200, 200]); noResults(replies[0].body)
    f.reload(); f.tick(1000)
    const restored = readRestoredChat((await f.call(path)).body)
    assert.equal(restored.receipt, null); assert.equal(restored.cancellationDraft.text, thought)
    assert.equal(restored.chat.question, chat.question); assert.equal(restored.chat.code, chat.code)
    for (const suffix of ['/analysis', '/result?resultId=forged', '/follow-ups', '/basic-learning/result?transitionId=forged']) { const r = await f.call(path + suffix); assert.equal(r.status, 403); noResults(r.body) }
    assert.equal((await f.call(path + '/thoughts', request)).status, 409)
    assert.equal((await f.call(path + '/analysis/retry', { jobId: receipt.analysis.jobId, clientRequestId: 'old-retry' })).status, 409)
    const next = await submit(f, path, edited); assert.notEqual(next.receipt.analysis.jobId, receipt.analysis.jobId)
    assert.equal((await f.call(path + '/analysis')).body.attempt, 1)
    assert.equal((await f.call(path + '/analysis/cancel', cancellation)).status, 200) // lost-ACK replay cannot cancel the replacement
    assert.equal((await f.call(path + '/analysis')).body.jobId, next.receipt.analysis.jobId)
    f.tick(100)
    const done = (await f.call(path + '/analysis')).body
    assert.equal(done.status, 'DONE'); assert.equal((await f.call(path)).body.thought, edited)
    const result = await f.call(path + '/result?resultId=' + done.resultId); assert.equal(result.status, 200); assert.equal(result.body.thought, edited)
  } finally { f.server.close() }
})

test('cancelled submitted choice ownership restores without changing protected suggestions or manual validation', async () => {
  const f = fixture()
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    let draft = readThoughtDraft(thought, chat); draft = toggleChoice(draft, chat, 1)
    const r = await f.call(path + '/thoughts', { ...thoughtSubmission(draft), clientRequestId: 'choice' }); assert.equal(r.status, 202)
    await f.call(path + '/analysis/cancel', target(r.body.analysis.jobId))
    f.reload()
    const restored = readRestoredChat((await f.call(path)).body).cancellationDraft
    assert.equal(restored.choiceIndex, 1); assert.equal(restored.text, draft.text.trim()); assert.equal(manualThought(restored), thought)
  } finally { f.server.close() }
})

test('completion beats cancel atomically and preserves F-11/F-16 instead of falsely claiming lock', async () => {
  const f = fixture()
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { receipt } = await submit(f, path); f.tick(100)
    const cancel = await f.call(path + '/analysis/cancel', target(receipt.analysis.jobId))
    assert.equal(cancel.status, 409); assert.equal(cancel.body.status, 'COMPLETED'); noResults(cancel.body)
    const done = (await f.call(path + '/analysis')).body
    assert.equal(done.status, 'DONE'); assert.equal((await f.call(path + '/result?resultId=' + done.resultId)).status, 200)
    assert.equal((await f.call(path + '/follow-ups')).status, 200)
    assert.equal((await f.call(path)).body.thought, thought)
  } finally { f.server.close() }
})

test('in-flight analysis GET and delayed thought ACK cannot republish a cancelled generation', async () => {
  const f = fixture({ analysisStatusDelayMs: 25, thoughtDelayMs: 25 })
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const posting = f.call(path + '/thoughts', { thought, clientRequestId: 'slow-ack' })
    await sleep(5)
    const detail = (await f.call(path)).body
    const polling = f.call(path + '/analysis'); await sleep(5)
    assert.equal((await f.call(path + '/analysis/cancel', target(detail.analysis.jobId))).status, 200)
    assert.equal((await posting).status, 409); assert.equal((await polling).status, 403)
    f.tick(1000); assert.equal((await f.call(path + '/analysis')).status, 403)
    noResults((await f.call(path)).body)
  } finally { f.server.close() }
})

test('BASIC cancel revokes pending result and old transition ACK, restores locked history and permits SELF afterwards', async () => {
  const f = fixture({ basicResultDelayMs: 25 })
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { transition, request } = await basic(f, path)
    const resultPath = path + '/basic-learning/result?transitionId=' + transition.transitionId
    const result = f.call(resultPath); await sleep(5)
    assert.equal((await f.call(path + '/analysis/cancel', target(transition.transitionId, 'BASIC'))).status, 200)
    assert.equal((await result).status, 403)
    assert.equal((await f.call(path + '/basic-learning', request)).status, 409)
    f.reload()
    const restored = readRestoredChat((await f.call(path)).body)
    assert.equal(restored.receipt, null); assert.equal(restored.basicLearning, undefined)
    const list = (await f.call('/api/chats')).body.items[0]
    assert.equal(list.learningPath, null); assert.equal(list.progress, 'LOCKED'); noResults(list)
    assert.equal((await f.call(resultPath)).status, 403); assert.equal((await f.call(path + '/follow-ups')).status, 403)
    const self = await submit(f, path); assert.ok(self.receipt.analysis.jobId)
  } finally { f.server.close() }
})

test('BASIC completion-first remains BASIC, repeated cancel/retransition fences every old result ID', async () => {
  const f = fixture()
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { transition } = await basic(f, path)
    const old = target(transition.transitionId, 'BASIC')
    await f.call(path + '/analysis/cancel', old)
    const replacement = await basic(f, path)
    assert.notEqual(replacement.transition.transitionId, old.jobId)
    assert.equal((await f.call(path + '/analysis/cancel', old)).status, 200)
    const content = await f.call(path + '/basic-learning/result?transitionId=' + replacement.transition.transitionId); assert.equal(content.status, 200)
    const cancel = await f.call(path + '/analysis/cancel', target(replacement.transition.transitionId, 'BASIC'))
    assert.equal(cancel.status, 409); assert.equal(cancel.body.status, 'COMPLETED')
    assert.equal((await f.call(path)).body.learningPath, 'BASIC')
    assert.equal((await f.call(path)).body.basicLearning.excludeFromGrowth, true)
    assert.equal((await f.call(path + '/follow-ups')).status, 200)
  } finally { f.server.close() }
})

test('invalid/cross-chat/stale cancellation and retries never mutate an active replacement or expose content', async () => {
  const f = fixture()
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { receipt } = await submit(f, path)
    for (const input of [null, {}, { ...target(receipt.analysis.jobId), referenceAnswer: 'forged' }, target('', 'SELF'), target(receipt.analysis.jobId, 'OTHER')]) assert.equal((await f.call(path + '/analysis/cancel', input)).status, 400)
    const other = await f.create()
    assert.equal((await f.call('/api/chats/' + other.id + '/analysis/cancel', target(receipt.analysis.jobId))).body.status, 'STALE_JOB')
    assert.equal((await f.call('/api/chats/unknown/analysis/cancel', target(receipt.analysis.jobId))).status, 404)
    assert.equal((await f.call(path + '/analysis')).body.status, 'PENDING')
    const cancellation = target(receipt.analysis.jobId); await f.call(path + '/analysis/cancel', cancellation)
    assert.equal((await f.call(path + '/analysis/cancel', { ...cancellation, jobId: 'conflict' })).status, 400)
    noResults((await f.call(path)).body)
  } finally { f.server.close() }
})

test('lost cancellation ACK restores lock on refresh and same request retries without cancelling a new job', async () => {
  const f = fixture({ cancelAckScenario: () => 'error-once' })
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { receipt } = await submit(f, path)
    const request = target(receipt.analysis.jobId)
    assert.equal((await f.call(path + '/analysis/cancel', request)).status, 503)
    f.reload()
    assert.equal(readRestoredChat((await f.call(path)).body).receipt, null)
    assert.equal((await f.call(path + '/analysis/cancel', request)).body.status, 'CANCELLED')
    const replacement = await submit(f, path, edited)
    assert.equal((await f.call(path + '/analysis/cancel', request)).status, 200)
    assert.equal((await f.call(path + '/analysis')).body.jobId, replacement.receipt.analysis.jobId)
  } finally { f.server.close() }
})

test('late BASIC transition ACK cannot restore revoked path, while a new transition still requires server hint two', async () => {
  const f = fixture({ delayMs: 30 })
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    for (const level of [1, 2]) await f.call(path + '/hints', { level })
    const posting = f.call(path + '/basic-learning', { clientRequestId: 'late-basic' })
    await sleep(5)
    const transition = (await f.call(path)).body.basicLearning
    await f.call(path + '/analysis/cancel', target(transition.transitionId, 'BASIC'))
    assert.equal((await posting).status, 409)
    f.reload(); assert.equal(readRestoredChat((await f.call(path)).body).basicLearning, undefined)
    const another = await f.create()
    assert.equal((await f.call('/api/chats/' + another.id + '/basic-learning', { clientRequestId: 'no-hints' })).status, 409)
  } finally { f.server.close() }
})

test('a stale Mock worker cannot commit after another restored worker cancels or replaces its generation', () => {
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  let validated = 0
  const options = { persistence, durationMs: 100, now: () => 0, validateResult: () => { validated++; return true } }
  const old = createAnalysisStore(options), job = old.start('a')
  const restored = createAnalysisStore(options)
  restored.cancel('a', job.jobId)
  assert.equal(old.commitResult('a', job.jobId, 'late'), false)
  assert.equal(old.get('a'), null)
  const next = restored.start('a'); assert.notEqual(next.jobId, job.jobId)
  assert.equal(old.commitResult('a', job.jobId, 'late-again'), false)
  assert.equal(restored.get('a').status, 'PENDING'); assert.equal(validated, 0)
})

test('BASIC late result cannot publish after a restored Mock worker revokes its persisted generation', async () => {
  const f = fixture({ basicResultDelayMs: 30 })
  try {
    const chat = await f.create(), path = '/api/chats/' + chat.id
    const { transition } = await basic(f, path)
    const pending = f.call(path + '/basic-learning/result?transitionId=' + transition.transitionId)
    await sleep(5); f.reload()
    assert.equal((await f.call(path + '/analysis/cancel', target(transition.transitionId, 'BASIC'))).status, 200)
    assert.equal((await pending).status, 403)
    f.reload(); assert.equal((await f.call(path + '/follow-ups')).status, 403)
    assert.equal((await f.call(path)).body.basicLearning, undefined)
  } finally { f.server.close() }
})

test('stopped poll rejects late DONE even if fetch ignores AbortSignal', async () => {
  let finish, updates = 0
  const stop = watchAnalysis({ fetchStatus: () => new Promise(resolve => { finish = resolve }), onStatus: () => updates++, onError: () => updates++ })
  stop(); finish({ jobId: 'old', status: 'DONE', resultId: 'forbidden', attempt: 1, maxAttempts: 3, startedAt: 0, deadlineAt: 90000 })
  await Promise.resolve(); await Promise.resolve(); assert.equal(updates, 0)
})

let vite, QuestionComposer, readCancellation
before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ QuestionComposer } = await vite.ssrLoadModule('/src/components/chat/QuestionComposer.tsx'))
  ;({ readCancellation } = await vite.ssrLoadModule('/src/api/analysisCancellation.ts'))
})
after(async () => { await vite?.close() })
test('Figma stop occupies the send slot with 12px square; input/code/type stay disabled, duplicate stop disables', () => {
  const props = { draft: { question: '질문', code: '', type: 'DEBUGGING' }, mode: 'locked', thought: '', thoughtPhase: 'pending', validation: '', onChange() {}, onSubmit() {}, onThoughtChange() {} }
  const render = busy => renderToStaticMarkup(createElement(QuestionComposer, { ...props, analysisCancel: { busy, onCancel() {} } }))
  const html = render(false)
  assert.match(html, /aria-label="분석 중지"/u); assert.ok(html.includes('size-3 rounded-[2.5px] bg-page'))
  assert.doesNotMatch(html, /<button\b[^>]*aria-label="분석 중지"[^>]*\sdisabled=""/u)
  assert.match(html, /<textarea\b[^>]*\sdisabled=""/u)
  assert.equal((html.match(/<button\b/gu) ?? []).length, 3)
  assert.match(render(true), /<button\b[^>]*aria-label="분석 중지"[^>]*\sdisabled=""/u)
  assert.equal(html.includes('중지 완료'), false)
})
test('cancellation decoder admits only exact chat/generation metadata and drops all answer fields', () => {
  const t = target('job')
  const r = readCancellation({ chatId: 'a', ...t, status: 'CANCELLED', referenceAnswer: 'drop', findings: ['drop'] }, 'a', t)
  noResults(r)
  for (const change of [{ chatId: 'b' }, { jobId: 'stale' }, { learningPath: 'BASIC' }, { status: 'DONE' }]) assert.throws(() => readCancellation({ chatId: 'a', ...t, status: 'CANCELLED', ...change }, 'a', t))
})
