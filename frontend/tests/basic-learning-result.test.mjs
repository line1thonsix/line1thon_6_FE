import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { readBasicLearningResult } from '../src/api/basicLearningResultState.ts'
import { readRestoredChat } from '../src/api/restoreChat.ts'
import { buildBasicLearningFixture } from '../src/mocks/basicLearningFixtures.ts'
import { exampleQuestions } from '../src/data/newChat.ts'

const origin = 'http://localhost:9888'
const draft = { question: 'users가 undefined라고 나와요', code: 'users.map(render)', type: 'DEBUGGING' }
const thought = '먼저 입력 조건과 실행 순서를 확인하고 작은 예시에서 실제 값을 출력해서 기대한 결과와 비교해 볼게요.'
const receipt = { chatId: 'chat', transitionId: 'transition', learningPath: 'BASIC', status: 'AWAITING_CONTENT', excludeFromGrowth: true }
const raw = () => buildBasicLearningFixture({ ...draft, id: 'chat', status: 'LOCKED', choices: ['a', 'b', 'c'], exampleSentence: 'example' }, receipt, 'result')
function fixture(extra = {}) {
  let now = 0
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, persistence, delayMs: 1, analysisDurationMs: 100, now: () => now, ...extra }
  const server = setupServer(...createChatHandlers(options))
  server.listen({ onUnhandledFrame: 'error' })
  return { server, db, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: n => { now = n } }
}
async function request(path, body, signal) {
  const r = await fetch(origin + path, body === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
async function create(value = draft) {
  const r = await request('/api/chats', { ...value, clientRequestId: crypto.randomUUID() })
  assert.equal(r.status, 201)
  return '/api/chats/' + r.body.id
}
async function eligible(path) {
  for (const input of [{ level: 1 }, { level: 2 }, { stuckPoint: 'FLOW' }, { stillDifficult: true }]) assert.equal((await request(path + '/hints', input)).status, 200)
}
async function transition(path) {
  const r = await request(path + '/basic-learning', { clientRequestId: crypto.randomUUID() })
  assert.equal(r.status, 202); return r.body
}
const endpoint = (path, t) => `${path}/basic-learning/result?transitionId=${t.transitionId}`
function privateMetadata(value) {
  for (const key of ['referenceAnswer', 'concept', 'exampleCode', 'steps', 'findings', 'score']) assert.equal(JSON.stringify(value).includes('"' + key + '"'), false, key)
}

test('F-12 decoder requires complete BASIC content atomically, rejects wrong route/identity and projects away evaluation fields', () => {
  const value = raw()
  value.score = 100; value.findings = [{ score: 100 }]; value.steps[0].score = 100
  const result = readBasicLearningResult(value, 'chat', 'transition')
  assert.equal(result.steps.length, 2); assert.equal(result.excludeFromGrowth, true)
  assert.equal('findings' in result, false); assert.equal('score' in result, false); assert.equal('score' in result.steps[0], false)
  for (const changed of [{ referenceAnswer: '' }, { concept: ' ' }, { exampleCode: '' }, { steps: [] }, { steps: [{ title: 'a', text: 'b' }, { title: '', text: 'b' }] }, { status: 'PENDING' }, { learningPath: 'SELF' }, { excludeFromGrowth: false }, { chatId: 'other' }, { transitionId: 'other' }]) {
    assert.throws(() => readBasicLearningResult({ ...raw(), ...changed }, 'chat', 'transition'))
  }
})

test('F-12 rejects direct/forged access at every pre-transition stage, wrong transition IDs and unknown chats', async () => {
  const f = fixture()
  try {
    const path = await create()
    const forged = path + '/basic-learning/result?transitionId=guessed&learningPath=BASIC&status=DONE&level=2&stillDifficult=true'
    assert.equal((await request(forged)).status, 403)
    for (const input of [{ level: 1 }, { level: 2 }, { stuckPoint: 'FLOW' }, { stillDifficult: true }]) {
      await request(path + '/hints', input)
      const denied = await request(forged)
      assert.equal(denied.status, 403); privateMetadata(denied.body)
    }
    const saved = await transition(path)
    assert.equal((await request(path + '/basic-learning/result?transitionId=wrong')).status, 404)
    assert.equal((await request('/api/chats/missing/basic-learning/result?transitionId=' + saved.transitionId)).status, 404)
    const other = await create(); await eligible(other); await transition(other)
    assert.equal((await request(endpoint(other, saved))).status, 404)
    assert.equal((await request(path + '/result?resultId=guess')).status, 403)
  } finally { f.server.close() }
})

test('F-09 → F-12 shows answer/concept/example/two starting steps, survives reload, and metadata/storage never preload answers', async () => {
  const f = fixture()
  try {
    const path = await create(); await eligible(path)
    const saved = await transition(path)
    const first = await request(endpoint(path, saved))
    assert.equal(first.status, 200)
    const result = readBasicLearningResult(first.body, saved.chatId, saved.transitionId)
    assert.ok(result.referenceAnswer.includes('useState([])')); assert.ok(result.concept.includes('undefined'))
    assert.ok(result.exampleCode.includes('console.log')); assert.equal(result.steps.length, 2)
    privateMetadata((await request(path)).body); privateMetadata((await request(path + '/hints')).body)
    f.reload()
    const restored = readRestoredChat((await request(path)).body)
    assert.equal(restored.receipt, null); assert.deepEqual(restored.basicLearning, saved)
    const second = await request(endpoint(path, restored.basicLearning))
    assert.deepEqual(second.body, first.body)
    assert.equal((await request(path + '/analysis')).status, 403)
    assert.equal((await request(path + '/result?resultId=' + result.resultId)).status, 403)
    const stored = JSON.stringify([...f.db])
    for (const text of [result.referenceAnswer, result.concept, result.exampleCode]) assert.equal(stored.includes(text), false)
  } finally { f.server.close() }
})

test('first result fetch failure retries the same transition successfully without another F-09 write, including after reload', async () => {
  const f = fixture({ basicResultScenario: () => 'error-once' })
  try {
    const path = await create(); await eligible(path); const saved = await transition(path)
    const error = await request(endpoint(path, saved))
    assert.equal(error.status, 503); privateMetadata(error.body)
    f.reload()
    const result = await request(endpoint(path, saved))
    assert.equal(result.status, 200); assert.equal(result.body.transitionId, saved.transitionId)
    const meta = readRestoredChat((await request(path)).body)
    assert.equal(meta.basicLearning.transitionId, saved.transitionId)
  } finally { f.server.close() }
})

test('empty/malformed/failed results never expose a partial answer and recover using the same result identity', async () => {
  let scenario = 'empty'
  const f = fixture({ basicResultScenario: () => scenario })
  try {
    const path = await create(); await eligible(path); const saved = await transition(path)
    for (scenario of ['empty', 'invalid', 'error']) {
      const error = await request(endpoint(path, saved))
      assert.equal(error.status, 503); privateMetadata(error.body)
      privateMetadata((await request(path)).body)
    }
    scenario = 'success'
    const result = await request(endpoint(path, saved)); assert.equal(result.status, 200)
    f.reload(); assert.equal((await request(endpoint(path, saved))).body.resultId, result.body.resultId)
  } finally { f.server.close() }
})

test('all three example questions produce distinct BASIC explanations/examples without comparing or grading thoughts', async () => {
  const f = fixture()
  try {
    const answers = new Set()
    for (const example of exampleQuestions) {
      const path = await create({ ...example, code: '' }); await eligible(path); const saved = await transition(path)
      const { body, status } = await request(endpoint(path, saved))
      assert.equal(status, 200); answers.add(body.referenceAnswer)
      const result = readBasicLearningResult(body, saved.chatId, saved.transitionId)
      assert.ok(result.concept && result.exampleCode && result.steps[0].text && result.steps[1].text)
      for (const key of ['thought', 'findings', 'score', 'evaluation']) assert.equal(key in result, false)
    }
    assert.equal(answers.size, 3)
  } finally { f.server.close() }
})

test('SELF keeps F-11 comparison results and cannot use F-12 even after completing the hint prerequisites', async () => {
  const f = fixture()
  try {
    const path = await create(); await eligible(path)
    assert.equal((await request(path + '/thoughts', { thought, clientRequestId: crypto.randomUUID() })).status, 202)
    f.tick(100)
    const done = (await request(path + '/analysis')).body
    const result = await request(path + '/result?resultId=' + done.resultId)
    assert.equal(result.status, 200); assert.equal(result.body.learningPath, 'SELF'); assert.ok(result.body.findings.length)
    const denied = await request(path + '/basic-learning/result?transitionId=' + done.resultId)
    assert.equal(denied.status, 403); privateMetadata(denied.body)
  } finally { f.server.close() }
})
