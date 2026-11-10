import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { readBasicLearningTransition } from '../src/api/basicLearningState.ts'
import { readRestoredChat } from '../src/api/restoreChat.ts'
import { readHintState } from '../src/api/hintState.ts'

const origin = 'http://localhost:9886'
const thought = '먼저 입력 조건과 실행 순서를 확인하고 작은 예시에서 실제 값을 출력해서 기대한 결과와 비교해 볼게요.'
function fixture(extra = {}) {
  let now = 0
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, persistence, delayMs: 1, analysisDurationMs: 100, now: () => now, ...extra }
  const server = setupServer(...createChatHandlers(options))
  server.listen({ onUnhandledFrame: 'error' })
  return { server, db, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: n => { now = n } }
}
async function request(path, body) {
  const r = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
async function create() {
  const r = await request('/api/chats', { question: 'users가 undefined라고 나와요', code: '', type: 'DEBUGGING', clientRequestId: crypto.randomUUID() })
  assert.equal(r.status, 201)
  return '/api/chats/' + r.body.id
}
async function prepare(path) {
  await request(path + '/hints', { level: 1 })
  await request(path + '/hints', { level: 2 })
}
const transition = (path, key = crypto.randomUUID()) => request(path + '/basic-learning', { clientRequestId: key })
const submit = path => request(path + '/thoughts', { thought, clientRequestId: crypto.randomUUID() })
function assertPrivate(value) {
  for (const key of ['referenceAnswer', 'findings', 'explanation', 'verificationCode', 'score']) assert.equal(JSON.stringify(value).includes(key), false)
}

test('F-09 requires only server-confirmed hint 2; hint 0/1 and forged claims cannot bypass it', async () => {
  const f = fixture()
  try {
    const path = await create()
    assert.equal((await transition(path)).status, 409)
    assert.equal((await request(path + '/hints', { level: 2 })).status, 409)
    assert.equal((await request(path + '/basic-learning', { clientRequestId: 'spoof', level: 2, stuckPoint: 'FLOW', stillDifficult: true })).status, 400)
    assert.equal((await request(path + '/hints', { stillDifficult: true })).status, 400)
    await request(path + '/hints', { level: 1 })
    assert.equal((await transition(path)).status, 409)
    await request(path + '/hints', { stuckPoint: 'FLOW' })
    assert.equal((await transition(path)).status, 409) // Optional selection is not a substitute for hint 2.
    await request(path + '/hints', { level: 2 })
    assert.equal((await transition(path)).status, 202)
    const noPoint = await create(); await prepare(noPoint)
    assert.equal((await request(noPoint + '/hints')).body.stuckPoint, null)
    assert.equal((await transition(noPoint)).status, 202)
  } finally { f.server.close() }
})

test('eligible transition is idempotent under duplicate requests, new IDs and reload; path is BASIC with F-12 content still private', async () => {
  const f = fixture()
  try {
    const path = await create(); await prepare(path)
    const before = (await request(path + '/hints')).body
    assert.equal(before.stuckPoint, null)
    assert.equal('stillDifficult' in before, false)
    f.reload()
    assert.deepEqual((await request(path + '/hints')).body, before)
    const [one, two] = await Promise.all([transition(path, 'same'), transition(path, 'same')])
    assert.equal(one.status, 202); assert.deepEqual(two.body, one.body)
    const saved = readBasicLearningTransition(one.body, path.split('/').at(-1))
    assert.equal(saved.status, 'AWAITING_CONTENT'); assert.equal(saved.excludeFromGrowth, true); assertPrivate(saved)
    assert.deepEqual((await transition(path, 'different-key')).body, saved)
    f.reload()
    assert.deepEqual((await transition(path, 'same')).body, saved)
    const detail = (await request(path)).body
    assert.equal(detail.status, 'LOCKED'); assert.equal(detail.learningPath, 'BASIC'); assertPrivate(detail)
    const restored = readRestoredChat(detail)
    assert.equal(restored.receipt, null); assert.deepEqual(restored.basicLearning, saved)
    const hints = readHintState((await request(path + '/hints')).body, saved.chatId)
    assert.deepEqual(hints.basicLearning, saved)
    assert.equal((await request(path + '/result?resultId=guessed&status=DONE')).status, 403)
    assert.equal((await request(path + '/analysis')).status, 403)
    assert.equal((await request(path + '/analysis/retry', { jobId: 'guess', clientRequestId: 'retry' })).status, 409)
    assert.equal((await submit(path)).status, 409)
    assert.equal((await request(path + '/hints', { stillDifficult: false })).status, 409)
  } finally { f.server.close() }
})

test('lost acknowledgement preserves committed path; refresh and retry return the same transition', async () => {
  const f = fixture({ basicScenario: () => 'error-once' })
  try {
    const path = await create(); await prepare(path)
    assert.equal((await transition(path, 'lost-ack')).status, 503)
    f.reload()
    const restored = readRestoredChat((await request(path)).body)
    assert.ok(restored.basicLearning)
    assert.deepEqual((await transition(path, 'lost-ack')).body, restored.basicLearning)
    assertPrivate(restored)
  } finally { f.server.close() }
})

test('writing a thought after hint 2 remains SELF and completes comparison without a return button', async () => {
  const f = fixture()
  try {
    const path = await create(); await prepare(path)
    assert.equal((await request(path)).body.learningPath, 'SELF')
    assert.equal((await submit(path)).status, 202)
    assert.equal((await transition(path)).status, 409)
    f.tick(100)
    const done = (await request(path + '/analysis')).body
    const result = await request(path + '/result?resultId=' + done.resultId)
    assert.equal(result.status, 200); assert.equal(result.body.learningPath, 'SELF'); assert.equal(result.body.thought, thought)
  } finally { f.server.close() }
})

test('simultaneous thought/basic submissions commit exactly one path, without starting analysis in BASIC', async () => {
  const f = fixture()
  try {
    for (const basicFirst of [true, false]) {
      const path = await create(); await prepare(path)
      const [a, b] = await Promise.all(basicFirst ? [transition(path), submit(path)] : [submit(path), transition(path)])
      assert.equal([a, b].filter(r => r.status === 409).length, 1)
      assert.equal([a, b].filter(r => r.status === 202).length, 1)
      const detail = (await request(path)).body
      assertPrivate(detail)
      if (detail.learningPath === 'BASIC') {
        assert.equal(detail.thought, undefined); assert.equal((await request(path + '/analysis')).status, 403)
      } else {
        assert.equal(detail.thought, thought); assert.equal(detail.basicLearning, undefined)
      }
    }
  } finally { f.server.close() }
})

test('invalid/cross-chat transition requests and corrupt or conflicting restored paths are rejected', async () => {
  const f = fixture()
  try {
    assert.equal((await transition('/api/chats/missing')).status, 404)
    const path = await create(); await prepare(path)
    for (const body of [{}, { clientRequestId: '' }, { clientRequestId: 'x'.repeat(101) }, { clientRequestId: 1 }]) assert.equal((await request(path + '/basic-learning', body)).status, 400)
    await transition(path, 'owned-key')
    const other = await create(); await prepare(other)
    assert.equal((await transition(other, 'owned-key')).status, 409)
    assert.equal((await request(other)).body.learningPath, 'SELF')
    const detail = (await request(path)).body
    assert.throws(() => readRestoredChat({ ...detail, learningPath: 'SELF' }))
    assert.throws(() => readRestoredChat({ ...detail, thoughtId: 'fake', thought }))
    assert.throws(() => readRestoredChat({ ...detail, basicLearning: { ...detail.basicLearning, excludeFromGrowth: false } }))
    const state = (await request(path + '/hints')).body
    assert.deepEqual(readHintState({ ...state, stuckPoint: null, stillDifficult: false }, detail.id).basicLearning, detail.basicLearning)
    assert.throws(() => readHintState({ ...state, level: 1, hints: state.hints.slice(0, 1) }, detail.id))
    assertPrivate(readBasicLearningTransition({ ...detail.basicLearning, referenceAnswer: 'hidden', findings: [] }, detail.id))
  } finally { f.server.close() }
})


test('legacy difficulty flags do not block hint-2-only transition or F-12 restoration with no selected point', async () => {
  const f = fixture()
  try {
    const path = await create(); await prepare(path)
    const id = path.split('/').at(-1)
    const rows = JSON.parse(f.db.get('hints'))
    rows.find(([key]) => key === id)[1].stillDifficult = false
    f.db.set('hints', JSON.stringify(rows)); f.reload()
    const help = readHintState((await request(path + '/hints')).body, id)
    assert.equal(help.stuckPoint, null); assert.equal(help.level, 2)
    assert.equal('stillDifficult' in help, false)
    const saved = (await transition(path)).body
    f.reload()
    assert.deepEqual(readHintState((await request(path + '/hints')).body, id).basicLearning, saved)
    const result = await request(path + '/basic-learning/result?transitionId=' + saved.transitionId)
    assert.equal(result.status, 200); assert.equal(result.body.excludeFromGrowth, true)
    assert.equal((await request(path + '/result?resultId=guess')).status, 403)
  } finally { f.server.close() }
})
