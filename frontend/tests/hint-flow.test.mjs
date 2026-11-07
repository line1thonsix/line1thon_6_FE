import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { readHintState } from '../src/api/hintState.ts'

const origin = 'http://localhost:9884'
const draft = { question: 'users가 undefined라고 나와요', code: 'users.map(render)', type: 'DEBUGGING' }
const thought = '먼저 입력 조건과 실행 순서를 확인하고 작은 예시에서 실제 값을 출력해서 기대한 결과와 비교해 볼게요.'
function fixture() {
  let now = 0
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, persistence, delayMs: 1, now: () => now, analysisDurationMs: 100 }
  const server = setupServer(...createChatHandlers(options))
  server.listen({ onUnhandledFrame: 'error' })
  return { server, db, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: value => { now = value } }
}
async function request(path, body) {
  const response = await fetch(origin + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}
async function create(value = draft) {
  const result = await request('/api/chats', { ...value, clientRequestId: crypto.randomUUID() })
  assert.equal(result.status, 201)
  return '/api/chats/' + result.body.id
}
function noAnswers(body) {
  for (const key of ['referenceAnswer', 'findings', 'resultId', 'basicExplanation']) assert.equal(JSON.stringify(body).includes(key), false)
}
const hiddenSecond = 'users.map을 부르는 줄 바로 앞에서 users 값을 찍어 보세요.'

test('hint decoder drops unrelated fields and rejects unopened, skipped, duplicated or cross-chat hints', () => {
  const raw = { chatId: 'chat', level: 1, stuckPoint: null, hints: [{ level: 1, text: 'hint one', referenceAnswer: 'hidden' }], referenceAnswer: 'hidden' }
  assert.deepEqual(readHintState(raw, 'chat'), { chatId: 'chat', level: 1, stuckPoint: null, hints: [{ level: 1, text: 'hint one' }] })
  assert.throws(() => readHintState(raw, 'other'))
  for (const value of [
    { ...raw, level: 0 }, { ...raw, level: 3 }, { ...raw, stuckPoint: 'INVALID' },
    { ...raw, hints: [{ level: 2, text: 'future' }] },
    { ...raw, level: 2, hints: [raw.hints[0], raw.hints[0]] },
    { ...raw, hints: [{ level: 1, text: ' ' }] },
  ]) assert.throws(() => readHintState(value, 'chat'))
})

test('Mock enforces 1 → 2, never sends unopened hint 2, deduplicates target levels and keeps answer locked', async () => {
  const f = fixture()
  try {
    const path = await create()
    const initial = await request(path + '/hints')
    assert.equal(initial.status, 200); assert.deepEqual(initial.body.hints, []); noAnswers(initial.body)
    assert.equal((await request(path + '/hints', { level: 2 })).status, 409)
    assert.equal((await request(path + '/hints', { stuckPoint: 'CONCEPT' })).status, 409)
    const [one, duplicate] = await Promise.all([request(path + '/hints', { level: 1 }), request(path + '/hints', { level: 1 })])
    assert.deepEqual(one.body, duplicate.body); assert.equal(one.body.level, 1)
    assert.equal(one.body.hints.length, 1); assert.equal(JSON.stringify(one.body).includes(hiddenSecond), false)
    noAnswers(one.body)
    const two = await request(path + '/hints', { level: 2 })
    assert.equal(two.body.level, 2); assert.equal(two.body.hints[1].text, hiddenSecond); noAnswers(two.body)
    assert.equal((await request(path + '/hints', { level: 1 })).body.level, 2)
    assert.equal((await request(path + '/hints', { level: 3 })).status, 400)
    assert.equal((await request(path + '/result?resultId=guess')).status, 403)
    noAnswers((await request(path)).body)
    const store = JSON.stringify([...f.db])
    assert.equal(store.includes(hiddenSecond), false)
  } finally { f.server.close() }
})

test('both revealed stages and optional stuck-point selection survive reload, and selection never personalizes hints', async () => {
  const f = fixture()
  try {
    const path = await create()
    const first = await request(path + '/hints', { level: 1 })
    f.reload(); assert.deepEqual((await request(path + '/hints')).body, first.body)
    for (const stuckPoint of ['CONCEPT', 'FLOW', 'VERIFICATION']) {
      const saved = await request(path + '/hints', { stuckPoint })
      assert.equal(saved.body.stuckPoint, stuckPoint); assert.deepEqual(saved.body.hints, first.body.hints)
    }
    await request(path + '/hints', { level: 2 }); f.reload()
    const restored = await request(path + '/hints')
    assert.equal(restored.body.level, 2); assert.equal(restored.body.stuckPoint, 'VERIFICATION')
    assert.equal(restored.body.hints.length, 2); noAnswers(restored.body)
    const other = await create()
    assert.deepEqual((await request(other + '/hints')).body.hints, [])
    assert.equal((await request(other + '/hints')).body.stuckPoint, null)
  } finally { f.server.close() }
})

test('stuck point is optional; malformed requests and nonexistent chats cannot advance state', async () => {
  const f = fixture()
  try {
    const path = await create()
    assert.equal((await request('/api/chats/missing/hints')).status, 404)
    assert.equal((await request('/api/chats/missing/hints', { level: 1 })).status, 404)
    for (const bad of [{}, { level: 1, stuckPoint: 'FLOW' }, { level: '1' }, { stuckPoint: 'unknown' }, { referenceAnswer: true }]) {
      assert.equal((await request(path + '/hints', bad)).status, 400)
      assert.equal((await request(path + '/hints')).body.level, 0)
    }
    await request(path + '/hints', { level: 1 })
    assert.equal((await request(path + '/hints', { level: 2 })).body.stuckPoint, null)
  } finally { f.server.close() }
})

test('hints do not alter the SELF path or submitted thought; post-submission requests cannot reveal hint 2', async () => {
  const f = fixture()
  try {
    const path = await create()
    await request(path + '/hints', { level: 1 })
    const saved = await request(path + '/thoughts', { thought, clientRequestId: crypto.randomUUID() })
    assert.equal(saved.status, 202); assert.equal(saved.body.thought, thought)
    assert.equal((await request(path + '/hints', { level: 2 })).status, 409)
    assert.equal((await request(path + '/hints', { stuckPoint: 'FLOW' })).status, 409)
    const hints = (await request(path + '/hints')).body
    assert.equal(hints.hints.length, 1); assert.equal(JSON.stringify(hints).includes(hiddenSecond), false)
    f.tick(100)
    const done = (await request(path + '/analysis')).body
    const result = await request(path + '/result?resultId=' + done.resultId)
    assert.equal(result.status, 200); assert.equal(result.body.learningPath, 'SELF'); assert.equal(result.body.thought, thought)
  } finally { f.server.close() }
})
