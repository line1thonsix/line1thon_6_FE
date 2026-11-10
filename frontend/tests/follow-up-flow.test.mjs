import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { createFollowUpController } from '../src/api/followUpController.ts'
import { readFollowUps, validateFollowUp } from '../src/api/followUpState.ts'
import { createDemoNotes, validateDemoNote } from '../src/storage/postResultDemo.ts'
import { createMockQuestionUsage } from '../src/mocks/questionUsage.ts'

const origin = 'http://localhost:9878'
const thought = '배열의 마지막 위치와 길이는 다르므로 반복 조건을 확인하고 작은 배열에서 인덱스별 값을 출력해서 비교해 볼게요.'
function fixture(extra = {}) {
  let now = Date.now()
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, persistence, delayMs: 1, analysisDurationMs: 100, now: () => now, ...extra }
  const server = setupServer(...createChatHandlers(options)); server.listen({ onUnhandledFrame: 'error' })
  const call = async (path, body) => {
    const r = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, body: await r.json() }
  }
  return { server, db, call, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: () => { now += 200 },
    create: async () => {
      const r = await call('/api/chats', { question: '반복문의 마지막 값이 왜 없을까요?', code: 'const a = [1,2,3]', type: 'DEBUGGING', clientRequestId: crypto.randomUUID() })
      assert.equal(r.status, 201); return '/api/chats/' + r.body.id
    },
  }
}
const q = (question = '다른 입력 조건에서는 어떻게 확인하나요?', clientRequestId = crypto.randomUUID()) => ({ question, clientRequestId })
async function self(f, path) {
  const r = await f.call(path + '/thoughts', { thought, clientRequestId: 'thought-' + path }); assert.equal(r.status, 202)
  f.tick()
  const done = (await f.call(path + '/analysis')).body; assert.equal(done.status, 'DONE')
  const resultPath = path + '/result?resultId=' + done.resultId
  assert.equal((await f.call(resultPath)).status, 200)
  return resultPath
}
async function basic(f, path) {
  for (const level of [1, 2]) assert.equal((await f.call(path + '/hints', { level })).status, 200)
  const r = await f.call(path + '/basic-learning', { clientRequestId: 'basic-' + path }); assert.equal(r.status, 202)
  return path + '/basic-learning/result?transitionId=' + r.body.transitionId
}

test('F-16 validation rejects whitespace and 2001 raw characters, allows 1/2000 and Korean/newlines', () => {
  for (const value of ['', ' \n ', '가'.repeat(2001), ' ' + '가'.repeat(2000)]) assert.ok(validateFollowUp(value))
  for (const value of ['왜?', '가'.repeat(2000), '첫 질문\n다음 조건']) assert.equal(validateFollowUp(value), null)
  const valid = { chatId: 'a', items: [{ id: '1', question: '왜?', answer: '확인해 보세요.', referenceAnswer: 'drop' }], remaining: 4, findings: ['drop'] }
  const read = readFollowUps(valid, 'a')
  assert.equal('findings' in read, false); assert.equal('referenceAnswer' in read.items[0], false)
  for (const raw of [null, {}, { ...valid, chatId: 'b' }, { ...valid, remaining: 5 }, { ...valid, items: [...valid.items, ...valid.items], remaining: 3 }, { ...valid, items: [{ id: '1', question: '왜?', answer: '' }] }]) assert.throws(() => readFollowUps(raw, 'a'))
})

test('Mock rejects GET/POST while LOCKED, hinted, PENDING and FAILED even with forged public state', async () => {
  const f = fixture({ analysisScenario: () => 'always-fail' })
  try {
    const path = await f.create()
    for (const suffix of ['/follow-ups', '/follow-ups?status=DONE&learningPath=BASIC']) {
      const r = await f.call(path + suffix); assert.equal(r.status, 403); assert.equal('items' in r.body, false)
    }
    assert.equal((await f.call(path + '/follow-ups', q())).status, 403)
    await f.call(path + '/hints', { level: 1 }); assert.equal((await f.call(path + '/follow-ups', q())).status, 403)
    await f.call(path + '/thoughts', { thought, clientRequestId: 'thought' })
    assert.equal((await f.call(path + '/follow-ups', q())).status, 403)
    f.tick(); assert.equal((await f.call(path + '/analysis')).body.status, 'FAILED')
    assert.equal((await f.call(path + '/follow-ups', q())).status, 403)
    assert.equal((await f.call('/api/chats/unknown/follow-ups')).status, 404)
    assert.equal(f.db.has('followUps'), false)
  } finally { f.server.close() }
})

test('SELF follow-ups preserve original thought/comparison, persist per conversation, and never enter history list bodies', async () => {
  const f = fixture()
  try {
    const path = await f.create(), resultPath = await self(f, path)
    const original = (await f.call(resultPath)).body
    for (const question of ['어떤 조건부터 확인할까요?', '전혀 다른 주제도 질문할 수 있나요?']) assert.equal((await f.call(path + '/follow-ups', q(question))).status, 200)
    f.reload()
    const restored = await f.call(path + '/follow-ups'); assert.equal(restored.body.items.length, 2)
    assert.equal(restored.body.remaining, 3)
    assert.deepEqual((await f.call(resultPath)).body, original)
    assert.equal((await f.call(path)).body.thought, thought)
    const list = (await f.call('/api/chats')).body
    for (const field of ['answer', 'items', 'referenceAnswer', 'thought']) assert.equal(field in list.items[0], false)
    const other = await f.create(); await self(f, other)
    assert.deepEqual((await f.call(other + '/follow-ups')).body.items, [])
    assert.equal(JSON.stringify(restored.body).includes('score'), false)
  } finally { f.server.close() }
})

test('BASIC follow-ups require successful result release, keep BASIC growth exclusion and restore after refresh', async () => {
  let scenario = 'error'
  const f = fixture({ basicResultScenario: () => scenario })
  try {
    const path = await f.create(), resultPath = await basic(f, path)
    assert.equal((await f.call(path + '/follow-ups', q())).status, 403)
    assert.equal((await f.call(resultPath)).status, 503)
    assert.equal((await f.call(path + '/follow-ups', q())).status, 403)
    scenario = 'success'; assert.equal((await f.call(resultPath)).status, 200)
    assert.equal((await f.call(path + '/follow-ups', q())).status, 200)
    f.reload(); assert.equal((await f.call(path + '/follow-ups')).body.items.length, 1)
    const restored = (await f.call(path)).body
    assert.equal(restored.learningPath, 'BASIC'); assert.equal(restored.basicLearning.excludeFromGrowth, true)
    assert.equal((await f.call('/api/chats')).body.items[0].learningPath, 'BASIC')
    assert.equal((await f.call(path + '/result?resultId=fake')).status, 403)
  } finally { f.server.close() }
})

test('duplicate and lost acknowledgements create one pair, five-pair limit is authoritative, and request conflicts reject', async () => {
  const f = fixture({ followUpDelayMs: 15 })
  try {
    const path = await f.create(); await self(f, path)
    const request = q()
    const [a, b] = await Promise.all([f.call(path + '/follow-ups', request), f.call(path + '/follow-ups', request)])
    assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.equal(a.body.items.length, 1)
    assert.equal((await f.call(path + '/follow-ups', { ...request, question: '교체된 질문' })).status, 409)
    f.reload(); assert.equal((await f.call(path + '/follow-ups', request)).body.items.length, 1)
    for (let i = 1; i < 5; i++) assert.equal((await f.call(path + '/follow-ups', q('질문 ' + i))).status, 200)
    assert.equal((await f.call(path + '/follow-ups', q())).status, 429)
    assert.equal((await f.call(path + '/follow-ups')).body.remaining, 0)
    assert.equal((await f.call(path + '/follow-ups', request)).status, 200)
  } finally { f.server.close() }
})

test('five accepted questions include failures, but the same failed request can retry at the cap', async () => {
  let scenario = 'error'
  const f = fixture({ followUpScenario: () => scenario })
  try {
    const path = await f.create(); await self(f, path)
    let last
    for (let i = 0; i < 5; i++) { last = q('실패 질문 ' + i); assert.equal((await f.call(path + '/follow-ups', last)).status, 503) }
    const snapshot = (await f.call(path + '/follow-ups')).body
    assert.equal(snapshot.remaining, 0); assert.equal(snapshot.items.length, 0)
    assert.equal(readFollowUps(snapshot, path.split('/').at(-1)).remaining, 0)
    assert.equal((await f.call(path + '/follow-ups', q())).status, 429)
    scenario = 'success'
    assert.equal((await f.call(path + '/follow-ups', last)).status, 200)
    assert.equal((await f.call(path + '/follow-ups')).body.items.length, 1)
  } finally { f.server.close() }
})

test('invalid/extra inputs reject and secret values are masked before Mock persistence and response', async () => {
  const f = fixture()
  try {
    const path = await f.create(); await self(f, path)
    for (const body of [null, {}, q(' \n '), q('a'.repeat(2001)), { ...q(), code: 'new code' }, q('왜?', ''), q('왜?', 'x'.repeat(101))]) assert.equal((await f.call(path + '/follow-ups', body)).status, 400)
    const secret = 'sk-' + 'a'.repeat(40)
    const r = await f.call(path + '/follow-ups', q('키는 ' + secret)); assert.equal(r.status, 200)
    assert.equal(JSON.stringify([...f.db]).includes(secret), false)
    assert.ok(r.body.items[0].question.includes('[REDACTED]'))
  } finally { f.server.close() }
})

test('failed requests preserve draft; retry after reload uses same identity without duplicate or extra quota', async () => {
  const f = fixture({ followUpScenario: () => 'error-once' })
  let local = null, ids = 0
  try {
    const path = await f.create(); await self(f, path)
    const deps = { read: () => local, write: value => { local = structuredClone(value) }, id: () => 'id-' + ++ids,
      fetch: async (_signal, body) => { const r = await f.call(path + '/follow-ups', body); if (r.status !== 200) throw new Error('연결 실패'); return readFollowUps(r.body, path.split('/').at(-1)) } }
    let c = createFollowUpController(path.split('/').at(-1), deps)
    await c.load(); c.change('실패해도 이 질문을 보존하나요?'); await c.submit()
    assert.equal(c.getState().phase, 'error'); assert.equal(c.getState().draft, '실패해도 이 질문을 보존하나요?')
    const id = local.request.clientRequestId
    f.reload(); c = createFollowUpController(path.split('/').at(-1), deps); await c.load()
    assert.equal(c.getState().phase, 'ready'); assert.equal(c.getState().draft, '')
    assert.equal(c.getState().items.length, 1); assert.equal(ids, 1)
    assert.equal((await f.call(path + '/follow-ups', q('실패해도 이 질문을 보존하나요?', id))).body.items.length, 1)
    const usage = JSON.parse(f.db.get('questionUsage'))[0][1]; assert.equal(usage.length, 2)
  } finally { f.server.close() }
})

test('controller suppresses duplicate sends, stale responses and validates before I/O; lost ACK reconciles', async () => {
  let stored = null, calls = 0, finish
  const snapshot = { chatId: 'a', items: [], remaining: 5 }
  const deps = { read: () => stored, write: v => { stored = structuredClone(v) }, id: () => 'id', fetch: async (_signal, body) => {
    if (!body) return snapshot
    calls++; return new Promise(resolve => { finish = () => resolve({ ...snapshot, items: [{ id: '1', question: body.question, answer: '확인하세요.' }], remaining: 4 }) })
  } }
  const c = createFollowUpController('a', deps); await c.load()
  c.change(' '); c.submit(); assert.equal(calls, 0)
  c.change('a'.repeat(2001)); c.submit(); assert.equal(calls, 0)
  c.change('첫 질문'); const promise = c.submit(); c.submit(); c.change('교체 시도'); assert.equal(calls, 1); assert.equal(c.getState().draft, '첫 질문')
  finish(); await promise; assert.equal(c.getState().items.length, 1)
  c.change('다음 질문'); const stale = c.submit(); c.cancel(); finish(); await stale
  assert.equal(c.getState().draft, '다음 질문'); assert.equal(c.getState().items.length, 1)
  assert.equal(stored.request.clientRequestId, 'id')
})

test('shared Mock question usage includes new and follow-up questions with day/IP windows and persisted limits', async () => {
  const f = fixture()
  try {
    const path = await f.create(); await self(f, path)
    for (let i = 0; i < 5; i++) assert.equal((await f.call(path + '/follow-ups', q('질문 ' + i))).status, 200)
    const requests = JSON.parse(f.db.get('questionUsage'))[0][1]; assert.equal(requests.length, 6)
    f.db.set('questionUsage', JSON.stringify([['mock-guest-and-ip', Array(30).fill(Date.now())]])); f.reload()
    const another = await f.call('/api/chats', { question: '다른 질문', code: '', type: 'DEBUGGING', clientRequestId: 'quota' }); assert.equal(another.status, 429)
    const usage = createMockQuestionUsage({ read: () => [['mock-guest-and-ip', Array(60).fill(new Date(2026, 10, 10, 23, 50).getTime())]], write() {} })
    assert.throws(() => usage(new Date(2026, 10, 11, 0, 5).getTime()), error => error.code === 'QUESTION_USAGE_LIMIT')
  } finally { f.server.close() }
})

test('F-15 counts all feedback characters, stays frontend-only, and does not mutate comparison or reflection', () => {
  let saved = null
  const c = createDemoNotes('feedback', true, { read: () => saved, write: v => { saved = structuredClone(v); return true } })
  c.open('reflection'); c.change('조건을 확인해 봤어요.'); c.submit()
  const reflection = saved.saved.reflection
  c.open('feedback'); c.change(' ' + '가'.repeat(2000)); assert.equal(c.submit(), false)
  assert.ok(validateDemoNote('feedback', '가'.repeat(2000) + ' '))
  c.change('가'.repeat(2000)); assert.equal(c.submit(), true)
  assert.equal(saved.saved.reflection, reflection); assert.equal(saved.saved.feedback.length, 2000)
  assert.equal('findings' in saved, false)
})

let vite, QuestionComposer, FollowUpMessages
before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ QuestionComposer } = await vite.ssrLoadModule('/src/components/chat/QuestionComposer.tsx'))
  ;({ FollowUpMessages } = await vite.ssrLoadModule('/src/components/chat/FollowUpConversation.tsx'))
})
after(async () => { await vite?.close() })
test('released composer reuses Figma guidance/layout with locked code/type, supports sends and disables loading/exhausted', () => {
  const state = { chatId: 'a', items: [], remaining: 5, loaded: true, draft: '이어서 질문해요', phase: 'ready', error: '' }
  const flow = { state, change() {}, submit() {}, retry() {} }
  const render = extra => renderToStaticMarkup(createElement(QuestionComposer, { draft: { question: '기존 질문', code: '', type: 'DEBUGGING' }, mode: 'completed', validation: '', onChange() {}, onSubmit() {}, thought: '', onThoughtChange() {}, followUp: { ...flow, state: { ...state, ...extra } } }))
  const ready = render({})
  assert.match(ready, /aria-label="후속 질문"/u); assert.ok(ready.includes('다른 주제의 질문은 새 채팅에서 던져 보세요.'))
  assert.doesNotMatch(ready, /readonly/iu)
  assert.doesNotMatch(ready, /<button\b[^>]*aria-label="후속 질문 보내기"[^>]*disabled/u)
  assert.equal((ready.match(/<button\b[^>]*\sdisabled=""/gu) ?? []).length, 2)
  for (const update of [{ phase: 'sending' }, { phase: 'loading' }, { remaining: 0 }]) assert.match(render(update), /<button\b[^>]*aria-label="후속 질문 보내기"[^>]*disabled/u)
  const html = renderToStaticMarkup(createElement(FollowUpMessages, { flow: { ...flow, state: { ...state, items: [{ id: '1', question: '<script>질문</script>', answer: '<script>답변</script>' }] } } }))
  assert.equal(html.includes('<script>'), false)
})
