import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { appendThought, thoughtMetrics, validateThought, THOUGHT_GUIDANCE, THOUGHT_TOO_LONG } from '../src/api/thoughtValidation.ts'
import { readPendingThought } from '../src/api/pendingThought.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { getPreparation } from '../src/mocks/chatFixtures.ts'

const origin = 'http://localhost:9877'
const valid = '처음 실행할 때의 값을 살펴보고, 입력 조건을 바꿔서 어떤 차이가 생기는지 확인해 볼래요.'
const headers = { 'Content-Type': 'application/json' }
const post = (path, body) => fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(body) })
async function createChat() {
  const response = await post('/api/chats', { question: '어떤 조건부터 확인할까요?', code: '', type: 'FREE', clientRequestId: crypto.randomUUID() })
  assert.equal(response.status, 201)
  return response.json()
}
function assertStillLocked(value) {
  const json = JSON.stringify(value)
  for (const name of ['referenceAnswer', 'findings', 'result', 'score', 'UNLOCKED']) assert.equal(json.includes(name), false, name)
  if ('status' in value) assert.ok(['LOCKED', 'PENDING'].includes(value.status))
}

test('F-07 exact 29/30/2000/2001 bounds and whitespace/UTF-16 counting', () => {
  const thirty = 'abcdefgh' + 'a'.repeat(22)
  assert.equal(thirty.length, 30)
  assert.equal(validateThought(thirty.slice(0, 29)), THOUGHT_GUIDANCE)
  assert.equal(validateThought('  \n' + thirty + '\t '), null)
  assert.equal(thoughtMetrics('  ab cd\nef  ').length, 8)
  assert.equal(thoughtMetrics(' 😀 ').length, 2)
  assert.equal(validateThought('abcdefgh' + 'a'.repeat(1992)), null)
  assert.equal(validateThought('abcdefgh' + 'a'.repeat(1993)), THOUGHT_TOO_LONG)
  assert.equal(validateThought(' \n\t '), THOUGHT_GUIDANCE)
})

test('F-07 requires 8 distinct non-whitespace characters, with no semantic grading', () => {
  assert.equal(validateThought('abcdefg'.repeat(5)), THOUGHT_GUIDANCE)
  assert.equal(validateThought('abcdefgh'.repeat(4)), null)
  assert.equal(validateThought(('abcdefg \n\t').repeat(5)), THOUGHT_GUIDANCE)
  assert.equal(thoughtMetrics('😀'.repeat(30)).distinct, 1)
  assert.equal(validateThought('😀'.repeat(30)), THOUGHT_GUIDANCE)
  assert.equal(thoughtMetrics('😀😁😂😃😄😅😆😇'.repeat(2)).distinct, 8)
  assert.equal(validateThought('😀😁😂😃😄😅😆😇'.repeat(2)), null)
})

test('choices count toward the same total, every mock example can be submitted unchanged, insertion never truncates', () => {
  const choice = '첫 렌더링 때 users 값부터 볼게요. 이유는 '
  assert.equal(thoughtMetrics(choice).length, 26)
  assert.equal(validateThought(appendThought(choice, '값이 아직 준비되지 않았을 수 있어서예요.')), null)
  for (const type of ['FREE', 'CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN']) {
    assert.equal(validateThought(getPreparation(type, '질문').exampleSentence), null)
  }
  assert.equal(validateThought(getPreparation('DEBUGGING', 'users').exampleSentence), null)
  const overlong = appendThought('abcdefgh'.repeat(250), '추가 문장')
  assert.ok(overlong.length > 2000)
  assert.equal(validateThought(overlong), THOUGHT_TOO_LONG)
})

test('pending response decoder only accepts locked/PENDING and retains no extra result fields', () => {
  const receipt = { chatId: 'chat', status: 'LOCKED', thoughtId: 'thought', thought: valid, analysis: { jobId: 'job', status: 'PENDING' } }
  const parsed = readPendingThought({ ...receipt, referenceAnswer: 'hidden', analysis: { ...receipt.analysis, result: 'hidden' } })
  assert.deepEqual(parsed, receipt)
  assertStillLocked(parsed)
  assert.throws(() => readPendingThought({ ...receipt, status: 'UNLOCKED_SELF' }))
  assert.throws(() => readPendingThought({ ...receipt, analysis: { jobId: 'job', status: 'DONE' } }))
  assert.throws(() => readPendingThought({ ...receipt, thought: '짧음' }))
})

test('MSW rejects invalid thoughts without starting analysis, duplicate submits share one immutable thought/job', async () => {
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1 }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const chat = await createChat()
    const path = '/api/chats/' + chat.id
    for (const text of [' ', 'a'.repeat(29), 'abcdefg'.repeat(5), 'abcdefgh' + 'a'.repeat(1993)]) {
      const invalid = await post(path + '/thoughts', { thought: text, clientRequestId: crypto.randomUUID() })
      assert.equal(invalid.status, 400)
      assert.equal((await fetch(origin + path + '/analysis')).status, 403)
    }
    const body = { thought: ' \n' + valid + '  ', clientRequestId: 'same-request' }
    const responses = await Promise.all([post(path + '/thoughts', body), post(path + '/thoughts', body)])
    assert.deepEqual(responses.map(r => r.status), [202, 202])
    const [first, second] = await Promise.all(responses.map(r => r.json()))
    assert.deepEqual(first, second)
    assert.equal(first.thought, valid)
    assert.equal((await (await post(path + '/thoughts', { ...body, clientRequestId: 'another-key' })).json()).analysis.jobId, first.analysis.jobId)
    assert.equal((await post(path + '/thoughts', { thought: valid + ' 바꿨어요.', clientRequestId: 'edit' })).status, 409)
    const detail = await (await fetch(origin + path)).json()
    assert.equal(detail.thought, valid)
    assert.equal(detail.status, 'LOCKED')
    const analysis = await (await fetch(origin + path + '/analysis')).json()
    assert.deepEqual(analysis, first.analysis)
    for (const value of [first, detail, analysis]) assertStillLocked(value)
    assert.equal((await post('/api/chats/missing/thoughts', { thought: valid, clientRequestId: 'missing' })).status, 404)
  } finally { server.close() }
})

test('MSW saves thought before a failed acknowledgement, retry uses the original job and never unlocks', async () => {
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, thoughtScenario: () => 'error-once' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const chat = await createChat()
    const path = '/api/chats/' + chat.id
    const body = { thought: valid, clientRequestId: 'retry-thought' }
    assert.equal((await post(path + '/thoughts', body)).status, 503)
    const saved = await (await fetch(origin + path)).json()
    assert.equal(saved.thought, valid)
    const response = await post(path + '/thoughts', body)
    assert.equal(response.status, 202)
    const retried = await response.json()
    assert.equal(retried.thoughtId, saved.thoughtId)
    assert.equal(retried.analysis.jobId, saved.analysis.jobId)
    assertStillLocked(retried)
  } finally { server.close() }
})
