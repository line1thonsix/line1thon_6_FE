import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { readAnalysisSnapshot } from '../src/api/analysisSnapshot.ts'
import { watchAnalysis } from '../src/api/watchAnalysis.ts'
import { createAnalysisStore } from '../src/mocks/analysisStore.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'

const base = { jobId: 'job', attempt: 1, maxAttempts: 3, startedAt: 0, deadlineAt: 90000 }
const pending = { ...base, status: 'PENDING' }
function assertNoContent(value) {
  const text = JSON.stringify(value)
  for (const key of ['referenceAnswer', 'findings', 'comparison', 'score', '"result":']) assert.equal(text.includes(key), false, key)
  if (value.status === 'PENDING' || value.status === 'FAILED') assert.equal('resultId' in value, false)
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function fakeTimers() {
  let now = 0
  let next = 0
  const queue = new Map()
  return {
    timers: { set(fn, ms) { const id = ++next; queue.set(id, { at: now + ms, fn }); return id }, clear(id) { queue.delete(id) } },
    async advance(ms) {
      const end = now + ms
      while (true) {
        const item = [...queue.entries()].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!item) break
        queue.delete(item[0]); now = item[1].at; item[1].fn(); await flush()
      }
      now = end; await flush()
    },
    size: () => queue.size,
  }
}

test('analysis decoder projects only status metadata and rejects invalid attempt/status/deadline', () => {
  assert.deepEqual(readAnalysisSnapshot({ ...pending, referenceAnswer: 'hidden', findings: ['hidden'], resultId: 'too-early' }), pending)
  const failed = { ...base, status: 'FAILED', reason: 'AI_ERROR' }
  assert.deepEqual(readAnalysisSnapshot({ ...failed, result: 'hidden' }), failed)
  assertNoContent(readAnalysisSnapshot(failed))
  const done = readAnalysisSnapshot({ ...base, status: 'DONE', resultId: 'result-one', referenceAnswer: 'hidden' })
  assert.equal(done.resultId, 'result-one')
  assertNoContent(done)
  for (const bad of [{ ...pending, attempt: 4 }, { ...pending, attempt: 0 }, { ...pending, maxAttempts: 5 }, { ...pending, deadlineAt: 1 }, { ...pending, status: 'DONE' }]) assert.throws(() => readAnalysisSnapshot(bad))
})

test('2 second polling stops on DONE without overlapping requests', async () => {
  const clock = fakeTimers()
  const states = []
  let calls = 0
  const stop = watchAnalysis({ timers: clock.timers,
    fetchStatus: async () => { calls++; return calls < 3 ? pending : { ...base, status: 'DONE', resultId: 'ready' } },
    onStatus: value => states.push(value.status), onError: () => assert.fail('unexpected GET error'),
  })
  await flush()
  assert.equal(calls, 1)
  await clock.advance(1999); assert.equal(calls, 1)
  await clock.advance(1); assert.equal(calls, 2)
  await clock.advance(2000); assert.equal(calls, 3)
  assert.deepEqual(states, ['PENDING', 'PENDING', 'DONE'])
  await clock.advance(20000); assert.equal(calls, 3)
  assert.equal(clock.size(), 0)
  stop()
})

test('GET error recovers by polling, FAILED stops polling without starting another attempt', async () => {
  const clock = fakeTimers()
  let calls = 0
  let errors = 0
  const states = []
  const stop = watchAnalysis({ timers: clock.timers,
    fetchStatus: async () => { if (++calls === 1) throw new Error('offline'); return calls === 2 ? pending : { ...base, status: 'FAILED', reason: 'AI_ERROR' } },
    onStatus: value => states.push(value), onError: () => errors++,
  })
  await flush(); assert.equal(errors, 1)
  await clock.advance(4000)
  assert.equal(calls, 3)
  assert.deepEqual(states.map(s => [s.status, s.attempt]), [['PENDING', 1], ['FAILED', 1]])
  await clock.advance(20000); assert.equal(calls, 3)
  stop()
})

test('polling cleanup aborts and discards late responses', async () => {
  const clock = fakeTimers()
  let resolve
  let signal
  let updates = 0
  const stop = watchAnalysis({ timers: clock.timers,
    fetchStatus: input => { signal = input; return new Promise(done => { resolve = done }) },
    onStatus: () => updates++, onError: () => updates++,
  })
  stop()
  assert.equal(signal.aborted, true)
  resolve({ ...base, status: 'DONE', resultId: 'late' })
  await flush(); await clock.advance(20000)
  assert.equal(updates, 0)
  assert.equal(clock.size(), 0)
})

test('hanging status request times out without overlapping requests', async () => {
  const clock = fakeTimers()
  let calls = 0
  let errors = 0
  const stop = watchAnalysis({ timers: clock.timers,
    fetchStatus: signal => { calls++; return new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }) }) },
    onStatus: () => assert.fail('unexpected status'), onError: () => errors++,
  })
  await clock.advance(9999); assert.equal(calls, 1)
  await clock.advance(1); assert.equal(errors, 1)
  await clock.advance(1999); assert.equal(calls, 1)
  await clock.advance(1); assert.equal(calls, 2)
  stop(); await flush(); assert.equal(clock.size(), 0)
})

test('mock AI failure gets one internal re-call; internal recovery uses the same attempt', () => {
  let now = 0
  const failure = createAnalysisStore({ now: () => now, durationMs: 100, scenario: () => 'invalid-output' })
  failure.start('chat')
  now = 100; assert.equal(failure.get('chat').status, 'PENDING')
  now = 199; assert.equal(failure.get('chat').status, 'PENDING')
  now = 200; assert.deepEqual([failure.get('chat').status, failure.get('chat').reason, failure.get('chat').attempt], ['FAILED', 'INVALID_OUTPUT', 1])
  now = 0
  const recover = createAnalysisStore({ now: () => now, durationMs: 100, scenario: () => 'recover' })
  const initial = recover.start('chat')
  now = 100; assert.equal(recover.get('chat').status, 'PENDING')
  now = 200; assert.equal(recover.get('chat').status, 'DONE')
  assert.equal(recover.get('chat').attempt, 1)
  assert.equal(recover.get('chat').jobId, initial.jobId)
})

test('90 second deadline resets for each user attempt', () => {
  let now = 1000
  const store = createAnalysisStore({ now: () => now, scenario: () => 'timeout' })
  const first = store.start('chat')
  now = 90999; assert.equal(store.get('chat').status, 'PENDING')
  now = 91000; assert.equal(store.get('chat').reason, 'TIMEOUT')
  const second = store.retry('chat', { jobId: first.jobId, clientRequestId: 'retry' })
  assert.equal(second.attempt, 2)
  assert.equal(second.deadlineAt, 181000)
  now = 180999; assert.equal(store.get('chat').status, 'PENDING')
  now = 181000; assert.equal(store.get('chat').reason, 'TIMEOUT')
})

const origin = 'http://localhost:9878'
const headers = { 'Content-Type': 'application/json' }
const post = (path, body) => fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(body) })
const thought = '먼저 입력 조건을 정리하고 실행 순서에 따라 값이 어떻게 바뀌는지 작은 예시로 확인해 볼래요.'
async function createSubmittedChat() {
  const chat = await (await post('/api/chats', { question: '어디서부터 확인할까요?', code: '', type: 'FREE', clientRequestId: crypto.randomUUID() })).json()
  const path = '/api/chats/' + chat.id
  assert.equal((await fetch(origin + path + '/analysis')).status, 403)
  const receipt = await (await post(path + '/thoughts', { thought, clientRequestId: crypto.randomUUID() })).json()
  return { path, receipt }
}

test('MSW successful DONE exposes only F-11 handle; PENDING and detail have no answer/results', async () => {
  let now = 0
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, now: () => now, analysisDurationMs: 100 }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const { path, receipt } = await createSubmittedChat()
    const get = async () => (await fetch(origin + path + '/analysis')).json()
    const initial = await get()
    assert.equal(initial.status, 'PENDING'); assert.equal(initial.jobId, receipt.analysis.jobId)
    assert.equal((await post(path + '/analysis/retry', { jobId: initial.jobId, clientRequestId: 'early' })).status, 409)
    assertNoContent(initial)
    assertNoContent(await (await fetch(origin + path)).json())
    now = 100
    const done = await get()
    assert.equal(done.status, 'DONE'); assert.equal(done.attempt, 1); assert.ok(done.resultId)
    assertNoContent(done)
    assert.deepEqual(await get(), done)
    const detail = await (await fetch(origin + path)).json()
    assert.equal(detail.thought, thought)
    assertNoContent(detail)
  } finally { server.close() }
})

test('MSW preserves thought through 3 failures, deduplicates retry, rejects a fourth attempt', async () => {
  let now = 0
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, now: () => now, analysisDurationMs: 100, analysisScenario: () => 'always-fail' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const { path } = await createSubmittedChat()
    let last
    for (let attempt = 1; attempt <= 3; attempt++) {
      now += 200
      last = await (await fetch(origin + path + '/analysis')).json()
      assert.equal(last.status, 'FAILED'); assert.equal(last.attempt, attempt)
      assertNoContent(last)
      const detail = await (await fetch(origin + path)).json()
      assert.equal(detail.thought, thought); assert.equal(detail.status, 'LOCKED'); assertNoContent(detail)
      if (attempt < 3) {
        const body = { jobId: last.jobId, clientRequestId: 'retry-' + attempt }
        const responses = await Promise.all([post(path + '/analysis/retry', body), post(path + '/analysis/retry', body)])
        assert.deepEqual(responses.map(r => r.status), [202, 202])
        const [first, second] = await Promise.all(responses.map(r => r.json()))
        assert.deepEqual(first, second); assert.equal(first.attempt, attempt + 1)
        assert.equal(first.deadlineAt - first.startedAt, 90000)
        // An uncertain retry acknowledgement can be safely replayed.
        assert.deepEqual(await (await post(path + '/analysis/retry', body)).json(), first)
        assert.equal((await post(path + '/analysis/retry', { ...body, clientRequestId: 'extra-' + attempt })).status, 409)
      }
    }
    const exhausted = await post(path + '/analysis/retry', { jobId: last.jobId, clientRequestId: 'fourth' })
    assert.equal(exhausted.status, 409)
    assert.equal((await exhausted.json()).code, 'ATTEMPTS_EXHAUSTED')
    assert.equal((await (await fetch(origin + path + '/analysis')).json()).attempt, 3)
  } finally { server.close() }
})

test('a late poll retains a success that finished before the deadline', () => {
  let now = 0
  const store = createAnalysisStore({ now: () => now, durationMs: 100 })
  store.start('chat')
  now = 100000
  assert.equal(store.get('chat').status, 'DONE')
  now = 0
  const tooSlow = createAnalysisStore({ now: () => now, durationMs: 100000 })
  tooSlow.start('chat')
  now = 90000
  assert.equal(tooSlow.get('chat').reason, 'TIMEOUT')
})

test('MSW failure followed by retry succeeds with the saved thought and exactly two attempts', async () => {
  let now = 0
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, now: () => now, analysisDurationMs: 100, analysisScenario: () => 'fail-once' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const { path } = await createSubmittedChat()
    now = 200
    const failed = await (await fetch(origin + path + '/analysis')).json()
    assert.equal(failed.status, 'FAILED')
    const response = await post(path + '/analysis/retry', { jobId: failed.jobId, clientRequestId: 'retry-success' })
    const pending = await response.json()
    assert.equal(pending.status, 'PENDING'); assert.equal(pending.attempt, 2)
    now = 300
    const done = await (await fetch(origin + path + '/analysis')).json()
    assert.equal(done.status, 'DONE'); assert.equal(done.attempt, 2)
    assertNoContent(done)
    const detail = await (await fetch(origin + path)).json()
    assert.equal(detail.thought, thought)
    assertNoContent(detail)
  } finally { server.close() }
})
