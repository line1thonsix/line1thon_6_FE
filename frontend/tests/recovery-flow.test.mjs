import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { readRestoredChat } from '../src/api/restoreChat.ts'
import { exampleQuestions } from '../src/data/newChat.ts'
import { readSession, writeSession, workspaceKey } from '../src/storage/session.ts'

const origin = 'http://localhost:9882'
const thought = '먼저 입력 조건과 실행 순서를 확인하고 작은 예시에서 실제 값을 출력해서 기대한 결과와 비교해 볼게요.'
const lock = body => { assert.equal(JSON.stringify(body).includes('referenceAnswer'), false); assert.equal(JSON.stringify(body).includes('findings'), false) }
function fixture(extra = {}) {
  let now = 0
  const db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, persistence, now: () => now, delayMs: 1, analysisDurationMs: 100, ...extra }
  const server = setupServer(...createChatHandlers(options))
  server.listen({ onUnhandledFrame: 'error' })
  return { db, server, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: value => { now = value } }
}
const get = async path => { const r = await fetch(origin + path); return { status: r.status, body: await r.json() } }
const post = async (path, value) => { const r = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); return { status: r.status, body: await r.json() } }
const create = async (draft = { question: '배열을 어떻게 확인할까요?', code: '', type: 'FREE' }, key = crypto.randomUUID()) => post('/api/chats', { ...draft, clientRequestId: key })
const submit = path => post(path + '/thoughts', { thought, clientRequestId: crypto.randomUUID() })

test('F-13 storage isolates API/Mock, restores drafts, ignores broken JSON and tolerates denied storage', () => {
  const previous = globalThis.sessionStorage
  const map = new Map()
  globalThis.sessionStorage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  try {
    const key = workspaceKey(true)
    assert.notEqual(key, workspaceKey(false))
    assert.equal(writeSession(key, { question: '질문', code: 'const a = 1', type: 'DEBUGGING' }), true)
    assert.equal(readSession(key).code, 'const a = 1')
    map.set(key, 'broken'); assert.equal(readSession(key), null)
    writeSession(key, null); assert.equal(readSession(key), null)
    globalThis.sessionStorage = { getItem() { throw Error() }, setItem() { throw Error() } }
    assert.equal(readSession(key), null); assert.equal(writeSession(key, {}), false)
  } finally { globalThis.sessionStorage = previous }
})

test('refresh keeps LOCKED; replay of uncertain question POST returns the same chat', async () => {
  const f = fixture()
  try {
    const draft = { question: '배열을 어떻게 확인할까요?', code: 'const a = []', type: 'DEBUGGING' }
    const first = await create(draft, 'same-request'); const path = '/api/chats/' + first.body.id
    f.reload()
    assert.equal((await create(draft, 'same-request')).body.id, first.body.id)
    const restored = readRestoredChat((await get(path)).body)
    assert.equal(restored.receipt, null); assert.equal(restored.chat.code, draft.code); lock(restored)
    assert.equal((await get(path + '/result?resultId=guess')).status, 403)
  } finally { f.server.close() }
})

test('refresh after lost thought acknowledgement uses server thought and resumes the same pending job through DONE', async () => {
  const f = fixture({ thoughtScenario: () => 'error' })
  try {
    const { body: chat } = await create(); const path = '/api/chats/' + chat.id
    assert.equal((await submit(path)).status, 503)
    f.reload()
    const restored = readRestoredChat((await get(path)).body)
    assert.equal(restored.receipt.thought, thought)
    const jobId = restored.receipt.analysis.jobId
    assert.equal((await get(path + '/analysis')).body.status, 'PENDING'); lock(restored)
    f.tick(100)
    const done = (await get(path + '/analysis')).body
    assert.equal(done.status, 'DONE'); assert.equal(done.jobId, jobId)
    f.reload()
    assert.equal(readRestoredChat((await get(path)).body).receipt.thought, thought)
    const restoredDone = (await get(path + '/analysis')).body
    assert.deepEqual(restoredDone, done)
    const result = await get(path + '/result?resultId=' + done.resultId)
    assert.equal(result.status, 200); assert.equal(result.body.thought, thought)
    const stored = JSON.stringify([...f.db])
    assert.equal(stored.includes('referenceAnswer'), false); assert.equal(stored.includes('findings'), false)
  } finally { f.server.close() }
})

test('FAILED refresh preserves thought, attempt budget and idempotent retry across reloads', async () => {
  const f = fixture({ analysisScenario: () => 'always-fail' })
  try {
    const { body: chat } = await create(); const path = '/api/chats/' + chat.id
    await submit(path)
    for (let attempt = 1; attempt <= 3; attempt++) {
      f.tick(attempt * 200); f.reload()
      const snapshot = (await get(path + '/analysis')).body
      assert.equal(snapshot.status, 'FAILED'); assert.equal(snapshot.attempt, attempt)
      assert.equal(readRestoredChat((await get(path)).body).receipt.thought, thought)
      assert.equal((await get(path + '/result?resultId=guess')).status, 403)
      const request = { jobId: snapshot.jobId, clientRequestId: 'retry-' + attempt }
      if (attempt < 3) {
        const retry = await post(path + '/analysis/retry', request)
        f.reload()
        assert.equal((await post(path + '/analysis/retry', request)).body.jobId, retry.body.jobId)
      } else assert.equal((await post(path + '/analysis/retry', request)).status, 409)
    }
  } finally { f.server.close() }
})

test('all three exact examples use tagged saved responses only in demo mode after simulated AI failure', async () => {
  const f = fixture({ demo: () => true, analysisScenario: () => 'always-fail' })
  try {
    for (let i = 0; i < exampleQuestions.length; i++) {
      f.tick(i * 200)
      const e = exampleQuestions[i]
      const { body: chat } = await create({ question: e.question, type: e.type, code: '' }); const path = '/api/chats/' + chat.id
      await submit(path)
      lock((await get(path)).body)
      assert.equal((await get(path + '/result?resultId=guess')).status, 403)
      f.tick((i + 1) * 200); f.reload()
      const done = (await get(path + '/analysis')).body
      assert.equal(done.status, 'DONE')
      const result = (await get(path + '/result?resultId=' + done.resultId)).body
      assert.equal(result.responseSource, 'SAVED_EXAMPLE'); assert.equal(result.thought, thought)
      assert.ok(result.referenceAnswer.length > 30)
      assert.equal(result.findings[0].category, 'UNDETERMINED')
    }
  } finally { f.server.close() }
})

test('free input, changed code/type and demo disabled cannot use saved answers; normal success has no saved tag', async () => {
  for (const demo of [true, false]) {
    const f = fixture({ demo: () => demo, analysisScenario: () => 'always-fail' })
    try {
      const e = exampleQuestions[0]
      const drafts = demo ? [{ question: '자유 질문입니다', code: '', type: 'FREE' }, { ...e, code: 'custom' }, { ...e, code: '', type: 'FREE' }] : [{ ...e, code: '' }]
      for (const draft of drafts) {
        f.tick(0)
        const { body: chat } = await create(draft); const path = '/api/chats/' + chat.id
        await submit(path); f.tick(200); f.reload()
        assert.equal((await get(path + '/analysis')).body.status, 'FAILED')
        assert.equal((await get(path + '/result?resultId=guess')).status, 403)
      }
    } finally { f.server.close() }
  }
  const f = fixture({ demo: () => true })
  try {
    const { body: chat } = await create({ ...exampleQuestions[0], code: '' }); const path = '/api/chats/' + chat.id
    await submit(path); f.tick(100)
    const done = (await get(path + '/analysis')).body
    assert.equal((await get(path + '/result?resultId=' + done.resultId)).body.responseSource, undefined)
  } finally { f.server.close() }
})

test('restore decoder retains server thought/job only, never leaked answer data or incomplete thought state', () => {
  const chat = { id: 'chat', question: '질문', code: '', type: 'FREE', status: 'LOCKED', choices: ['a', 'b', 'c'], exampleSentence: '예시' }
  const analysis = { jobId: 'server-job', status: 'FAILED', reason: 'AI_ERROR', attempt: 3, maxAttempts: 3, startedAt: 0, deadlineAt: 90000 }
  const restored = readRestoredChat({ ...chat, thoughtId: 'thought', thought, analysis, referenceAnswer: 'leaked', findings: [] })
  assert.equal(restored.receipt.analysis.jobId, 'server-job'); assert.equal(restored.receipt.thought, thought); lock(restored)
  assert.throws(() => readRestoredChat({ ...chat, thought, analysis }))
  assert.throws(() => readRestoredChat({ ...chat, thoughtId: 'thought', thought, analysis: { ...analysis, attempt: 4 } }))
})

test('slow analysis persists its 30-second schedule across refresh, stays locked, then completes the same job', async () => {
  const f = fixture({ analysisScenario: () => 'slow', analysisDurationMs: 3000 })
  try {
    const { body: chat } = await create(); const path = '/api/chats/' + chat.id
    await submit(path)
    const original = (await get(path + '/analysis')).body
    f.tick(10000); f.reload()
    const restored = readRestoredChat((await get(path)).body)
    assert.equal(restored.receipt.analysis.jobId, original.jobId)
    const pending = (await get(path + '/analysis')).body
    assert.equal(pending.status, 'PENDING'); assert.equal(pending.startedAt, original.startedAt)
    assert.equal(pending.attempt, 1); lock(pending)
    assert.equal((await get(path + '/result?resultId=guess')).status, 403)
    f.tick(29999); assert.equal((await get(path + '/analysis')).body.status, 'PENDING')
    f.tick(30000)
    const done = (await get(path + '/analysis')).body
    assert.equal(done.status, 'DONE'); assert.equal(done.jobId, original.jobId)
    assert.equal(done.attempt, 1)
    assert.equal((await get(path + '/result?resultId=' + done.resultId)).status, 200)
  } finally { f.server.close() }
})
