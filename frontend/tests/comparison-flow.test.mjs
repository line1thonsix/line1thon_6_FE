import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { readComparisonResult, findingCounts, filterFindings, ComparisonValidationError } from '../src/api/comparisonResult.ts'
import { buildComparisonFixture } from '../src/mocks/comparisonFixtures.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { createAnalysisStore } from '../src/mocks/analysisStore.ts'

const thought = '첫 렌더링 때 users 값부터 볼게요. 이유는 데이터가 오기 전에는 users가 비어 있을 것 같아서예요. console.log로 값을 찍어 확인하고, 빈 배열일 때도 따로 해 볼래요.'
const chat = { id: 'chat', status: 'LOCKED', question: '목록을 불러오는데 users가 undefined라고 나와요', code: 'const [users, setUsers] = useState();', type: 'DEBUGGING' }
const rawFixture = (scenario = 'all-categories') => buildComparisonFixture(chat, thought, 'job', 'result', scenario)

function assertLockedBody(value) {
  assert.equal(JSON.stringify(value).includes('referenceAnswer'), false)
  assert.equal(JSON.stringify(value).includes('findings'), false)
}

test('F-11 validates all five finding shapes, filters and counts stay entirely local', () => {
  const result = readComparisonResult(rawFixture(), thought)
  assert.equal(result.findings.length, 5)
  const counts = findingCounts(result.findings)
  assert.equal(counts.ALL, 5)
  for (const category of ['COMMON', 'COMPLEMENT', 'UNIQUE', 'CONFLICT', 'UNDETERMINED']) {
    assert.equal(counts[category], 1)
    assert.equal(filterFindings(result.findings, category)[0].category, category)
  }
  const conflict = result.findings.find(f => f.category === 'CONFLICT')
  assert.ok(conflict.conflictEvidence)
  assert.ok(conflict.verification)
  assert.notEqual(conflict.conflictEvidence, conflict.verification)
  assert.equal(filterFindings(result.findings, 'ALL').length, 5)
})

test('non-source quotes are removed, including optional quotes; exact original substrings survive', () => {
  const raw = rawFixture('invalid-quote')
  raw.findings.push({ ...raw.findings[1], id: 'bad-optional', userQuote: '존재하지 않는 인용' })
  raw.findings.push({ ...raw.findings[0], id: 'case-change', userQuote: 'CONSOLE.LOG' })
  raw.findings.push({ ...raw.findings[0], id: 'valid-substring', userQuote: 'console.log로 값을 찍어 확인하고' })
  const result = readComparisonResult(raw, thought)
  assert.equal(result.findings.some(f => ['invalid-quote', 'bad-optional', 'case-change'].includes(f.id)), false)
  assert.equal(result.findings.some(f => f.id === 'valid-substring'), true)
  for (const finding of result.findings) if (finding.userQuote) assert.equal(thought.includes(finding.userQuote), true)
})

test('only a valid DONE result can supply an explicitly empty findings array', () => {
  assert.deepEqual(readComparisonResult(rawFixture('empty'), thought).findings, [])
  assert.throws(() => readComparisonResult(rawFixture('all-invalid'), thought), error => error instanceof ComparisonValidationError && error.kind === 'empty')
  assert.throws(() => readComparisonResult({ ...rawFixture(), findings: null }, thought))
  assert.throws(() => readComparisonResult({ ...rawFixture(), status: 'PENDING' }, thought))
  assert.throws(() => readComparisonResult(rawFixture(), thought + '다른 원문'))
  const broken = rawFixture('sparse')
  delete broken.findings[0].reason
  assert.throws(() => readComparisonResult(broken, thought))
})

test('sparse categories are valid and yield zero counts; scores and unapproved fields are never retained', () => {
  const raw = rawFixture('sparse')
  raw.score = 100
  raw.findings[0].score = 100
  const result = readComparisonResult(raw, thought)
  assert.equal(findingCounts(result.findings).ALL, 1)
  assert.equal(findingCounts(result.findings).CONFLICT, 0)
  assert.deepEqual(filterFindings(result.findings, 'CONFLICT'), [])
  assert.equal('score' in result, false)
  assert.equal('score' in result.findings[0], false)
})

test('invalid result validation gets at most one internal re-call and cannot become DONE', () => {
  let now = 0
  let validations = 0
  const store = createAnalysisStore({ now: () => now, durationMs: 100, validateResult: () => { validations++; return false } })
  store.start('chat')
  now = 100; assert.equal(store.get('chat').status, 'PENDING'); assert.equal(validations, 1)
  now = 150; store.get('chat'); assert.equal(validations, 1)
  now = 200; assert.equal(store.get('chat').reason, 'INVALID_OUTPUT'); assert.equal(validations, 2)
  store.get('chat'); assert.equal(validations, 2)
  now = 0; validations = 0
  const recoveredButInvalid = createAnalysisStore({ now: () => now, durationMs: 100, scenario: () => 'recover', validateResult: () => { validations++; return false } })
  recoveredButInvalid.start('chat'); now = 200
  assert.equal(recoveredButInvalid.get('chat').status, 'FAILED')
  assert.equal(validations, 1) // first internal call had already failed in the recover scenario
  now = 0
  const slowValidation = createAnalysisStore({ now: () => now, durationMs: 60000, validateResult: () => false })
  slowValidation.start('chat'); now = 60000
  assert.equal(slowValidation.get('chat').status, 'PENDING')
  now = 90000; assert.equal(slowValidation.get('chat').reason, 'TIMEOUT')
  now = 0
  const lateInvalid = createAnalysisStore({ now: () => now, durationMs: 60000, validateResult: () => false })
  lateInvalid.start('chat'); now = 90000
  assert.equal(lateInvalid.get('chat').reason, 'TIMEOUT')
})

const origin = 'http://localhost:9879'
const headers = { 'Content-Type': 'application/json' }
const post = (path, body) => fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(body) })
async function createChat() {
  const response = await post('/api/chats', { question: chat.question, code: chat.code, type: chat.type, clientRequestId: crypto.randomUUID() })
  assert.equal(response.status, 201)
  const created = await response.json()
  assertLockedBody(created)
  return { path: '/api/chats/' + created.id, created }
}
async function submitThought(path) {
  const response = await post(path + '/thoughts', { thought, clientRequestId: crypto.randomUUID() })
  assert.equal(response.status, 202)
  const saved = await response.json()
  assertLockedBody(saved)
  return saved
}

test('P0 integration: question → lock → validated thought → PENDING → DONE → comparison with five categories', async () => {
  let now = 0
  const server = setupServer(...createChatHandlers({ origin, now: () => now, delayMs: 1, analysisDurationMs: 100, comparisonScenario: () => 'all-categories' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const { path } = await createChat()
    const early = await fetch(origin + path + '/result?status=DONE&resultId=guessed')
    assert.equal(early.status, 403); assertLockedBody(await early.json())
    const invalid = await post(path + '/thoughts', { thought: '짧음', clientRequestId: 'invalid' })
    assert.equal(invalid.status, 400)
    await submitThought(path)
    const pending = await (await fetch(origin + path + '/analysis')).json()
    assert.equal(pending.status, 'PENDING'); assertLockedBody(pending)
    assertLockedBody(await (await fetch(origin + path)).json())
    assert.equal((await fetch(origin + path + '/result?status=DONE')).status, 403)
    now = 100
    const done = await (await fetch(origin + path + '/analysis')).json()
    assert.equal(done.status, 'DONE'); assertLockedBody(done)
    assert.equal((await fetch(origin + path + '/result?resultId=wrong')).status, 404)
    const response = await fetch(origin + path + '/result?resultId=' + done.resultId)
    assert.equal(response.status, 200)
    const result = readComparisonResult(await response.json(), thought)
    assert.equal(result.jobId, done.jobId)
    assert.equal(result.resultId, done.resultId)
    assert.equal(result.thought, thought)
    assert.ok(result.referenceAnswer)
    assert.equal(result.findings.length, 5)
    assert.equal(result.learningPath, 'SELF')
    assert.deepEqual(findingCounts(result.findings), { ALL: 5, COMMON: 1, COMPLEMENT: 1, UNIQUE: 1, CONFLICT: 1, UNDETERMINED: 1 })
  } finally { server.close() }
})

test('P0 retry integration: FAILED never reveals results; retry completes with the original thought', async () => {
  let now = 0
  const server = setupServer(...createChatHandlers({ origin, now: () => now, delayMs: 1, analysisDurationMs: 100, analysisScenario: () => 'fail-once' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const { path } = await createChat(); await submitThought(path)
    now = 200
    const failed = await (await fetch(origin + path + '/analysis')).json()
    assert.equal(failed.status, 'FAILED')
    assert.equal((await fetch(origin + path + '/result?resultId=guessed')).status, 403)
    const retry = await post(path + '/analysis/retry', { jobId: failed.jobId, clientRequestId: 'retry' })
    assert.equal(retry.status, 202)
    now = 300
    const done = await (await fetch(origin + path + '/analysis')).json()
    assert.equal(done.status, 'DONE'); assert.equal(done.attempt, 2)
    const result = readComparisonResult(await (await fetch(origin + path + '/result?resultId=' + done.resultId)).json(), thought)
    assert.equal(result.thought, thought)
  } finally { server.close() }
})

test('all-invalid quotes fail analysis, preserve thought, and keep results locked through 3 attempts', async () => {
  let now = 0
  const server = setupServer(...createChatHandlers({ origin, now: () => now, delayMs: 1, analysisDurationMs: 100, comparisonScenario: () => 'all-invalid' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const { path } = await createChat(); await submitThought(path)
    for (let attempt = 1; attempt <= 3; attempt++) {
      now += 200
      const failed = await (await fetch(origin + path + '/analysis')).json()
      assert.equal(failed.status, 'FAILED'); assert.equal(failed.reason, 'INVALID_OUTPUT'); assert.equal(failed.attempt, attempt)
      assertLockedBody(failed)
      const forbidden = await fetch(origin + path + '/result?status=DONE&resultId=guessed')
      assert.equal(forbidden.status, 403); assertLockedBody(await forbidden.json())
      const detail = await (await fetch(origin + path)).json()
      assert.equal(detail.thought, thought); assertLockedBody(detail)
      const retry = await post(path + '/analysis/retry', { jobId: failed.jobId, clientRequestId: 'retry-' + attempt })
      assert.equal(retry.status, attempt < 3 ? 202 : 409)
    }
  } finally { server.close() }
})

test('MSW releases valid empty and sparse results and filters hallucinated quotes', async () => {
  for (const scenario of ['empty', 'invalid-quote', 'sparse']) {
    let now = 0
    const server = setupServer(...createChatHandlers({ origin, now: () => now, delayMs: 1, analysisDurationMs: 100, comparisonScenario: () => scenario }))
    server.listen({ onUnhandledFrame: 'error' })
    try {
      const { path } = await createChat(); await submitThought(path); now = 100
      const done = await (await fetch(origin + path + '/analysis')).json()
      assert.equal(done.status, 'DONE')
      const result = await (await fetch(origin + path + '/result?resultId=' + done.resultId)).json()
      if (scenario === 'empty') assert.deepEqual(readComparisonResult(result, thought).findings, [])
      assert.equal(result.findings.some(f => f.id === 'invalid-quote'), false)
      for (const finding of result.findings) if (finding.userQuote) assert.equal(thought.includes(finding.userQuote), true)
      if (scenario === 'sparse') assert.equal(findingCounts(result.findings).UNIQUE, 0)
    } finally { server.close() }
  }
})

test('results fetch failure reveals no partial answer and different chat/result IDs cannot bypass the lock', async () => {
  let now = 0
  let scenario = 'fetch-error'
  const server = setupServer(...createChatHandlers({ origin, now: () => now, delayMs: 1, analysisDurationMs: 100, comparisonScenario: () => scenario }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const first = await createChat(); await submitThought(first.path); now = 100
    const done = await (await fetch(origin + first.path + '/analysis')).json()
    const unavailable = await fetch(origin + first.path + '/result?resultId=' + done.resultId)
    assert.equal(unavailable.status, 503); assertLockedBody(await unavailable.json())
    const second = await createChat(); await submitThought(second.path)
    assert.equal((await fetch(origin + second.path + '/result?resultId=' + done.resultId)).status, 403)
    now = 200
    await fetch(origin + second.path + '/analysis')
    assert.equal((await fetch(origin + second.path + '/result?resultId=' + done.resultId)).status, 404)
    scenario = 'standard'
    const recovered = await fetch(origin + first.path + '/result?resultId=' + done.resultId)
    assert.equal(recovered.status, 200)
    assert.equal(readComparisonResult(await recovered.json(), thought).thought, thought)
  } finally { server.close() }
})
