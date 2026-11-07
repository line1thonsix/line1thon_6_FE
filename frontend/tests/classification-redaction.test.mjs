import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { redactSecrets, redactValue, REDACTED } from '../src/security/redaction.ts'
import { classifyMockQuestion } from '../src/mocks/questionClassification.ts'
import { questionPerspectives } from '../src/data/questionPerspectives.ts'
import { readSession, writeSession, sanitizeExistingSessions } from '../src/storage/session.ts'
import { readLockedChat } from '../src/api/lockedChat.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'

// Synthetic non-working examples only; never use real credentials in tests.
const apiKey = 'sk-proj-' + 'a'.repeat(32)
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.' + 'b'.repeat(32)
const pem = '-----BEGIN RSA PRIVATE KEY-----\nFAKE-NOT-A-REAL-KEY\n-----END RSA PRIVATE KEY-----'
const rawDraft = { question: 'users가 undefined인 원인은 무엇일까요?', code: `const apiKey = "${apiKey}";\nconst auth = "Bearer ${jwt}";\n${pem}`, type: 'FREE' }
const thought = `먼저 실행 조건과 값을 출력해서 확인하고 작은 예시와 비교해 볼게요. token="${jwt}"`
const origin = 'http://localhost:9890'
async function request(path, body) {
  const r = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
function fixture(extra = {}) {
  const db = new Map(); let now = 0
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(redactValue(value).value)) }
  const options = { origin, persistence, delayMs: 1, analysisDurationMs: 100, now: () => now, ...extra }
  const server = setupServer(...createChatHandlers(options)); server.listen({ onUnhandledFrame: 'error' })
  return { server, db, reload: () => server.resetHandlers(...createChatHandlers(options)), tick: n => { now = n } }
}
function noSecrets(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const secret of [apiKey, jwt, 'FAKE-NOT-A-REAL-KEY']) assert.equal(text.includes(secret), false)
}
function noAnswers(value) {
  for (const key of ['referenceAnswer', 'findings', 'exampleCode']) assert.equal(JSON.stringify(value).includes('"' + key + '"'), false)
}

test('F-04 masks API keys, JWT/Bearer, complete/incomplete private keys and labelled secrets without logging matches', () => {
  const samples = [apiKey, jwt, pem, pem.split('-----END')[0], 'ghp_' + 'c'.repeat(32), 'AKIA' + 'D'.repeat(16), 'AIza' + 'e'.repeat(32), 'sk_live_' + 'f'.repeat(24), 'xoxb-' + 'g'.repeat(24)]
  for (const sample of samples) { const safe = redactSecrets(sample); assert.equal(safe.value, REDACTED); assert.equal(safe.redacted, true) }
  for (const name of ['apiKey', 'OPENAI_API_KEY', 'VITE_API_KEY', 'password', 'clientSecret', 'AWS_SECRET_ACCESS_KEY', 'token']) {
    assert.equal(redactSecrets(`${name}="fake-secret"`).value, `${name}="${REDACTED}"`)
    assert.equal(redactSecrets(`${name}=fake-secret`).value, `${name}=${REDACTED}`)
    assert.equal(redactSecrets(`"${name}": "fake-secret"`).value, `"${name}": "${REDACTED}"`)
  }
  assert.equal(redactSecrets('postgres://tester:fake-password@localhost/db').value, 'postgres://tester:[REDACTED]@localhost/db')
  assert.equal(redactSecrets(`Bearer ${jwt}`).value, 'Bearer [REDACTED]')
})

test('redaction is idempotent, preserves ordinary code/environment references and does not claim general PII detection', () => {
  const normal = 'const users = []; const apiKey = process.env.API_KEY; const secret = import.meta.env.VITE_API_KEY; contact@example.com 010-1234-5678'
  assert.deepEqual(redactSecrets(normal), { value: normal, redacted: false })
  const mixed = `${normal}\napiKey="${apiKey}"\n${pem}`
  const first = redactSecrets(mixed)
  noSecrets(first.value)
  assert.deepEqual(redactSecrets(first.value), { value: first.value, redacted: false })
  const object = { draft: rawDraft, thought, status: 'LOCKED', attempt: 1, ready: true, list: [jwt, null] }
  const safe = redactValue(object)
  noSecrets(safe.value); assert.equal(safe.redacted, true)
  assert.equal(safe.value.status, 'LOCKED'); assert.equal(safe.value.attempt, 1)
  const legacy = redactValue({ fingerprint: JSON.stringify({ code: 'const password = "fake-secret";' }) })
  assert.equal(legacy.redacted, true)
  assert.deepEqual(redactValue(legacy.value), { value: legacy.value, redacted: false })
  assert.equal(JSON.parse(legacy.value.fingerprint).code, 'const password = "[REDACTED]";')
  assert.equal(object.draft.code, rawDraft.code) // source remains in editing memory only
})

test('temporary storage masks before write and upgrades legacy Deveil keys before returning their values', () => {
  const previous = globalThis.sessionStorage
  const map = new Map()
  globalThis.sessionStorage = { get length() { return map.size }, key: i => [...map.keys()][i] ?? null, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  try {
    writeSession('deveil:mock:workspace:v1', { draft: rawDraft })
    noSecrets(map.get('deveil:mock:workspace:v1'))
    map.set('deveil:thought-draft:v1:old', JSON.stringify(thought))
    assert.equal(readSession('deveil:thought-draft:v1:old'), redactSecrets(thought).value)
    noSecrets(map.get('deveil:thought-draft:v1:old'))
    map.set('deveil:api:workspace:v1', JSON.stringify({ code: pem }))
    map.set('another-app', JSON.stringify({ code: pem }))
    sanitizeExistingSessions()
    noSecrets(map.get('deveil:api:workspace:v1'))
    assert.equal(JSON.parse(map.get('another-app')).code, pem)
  } finally { globalThis.sessionStorage = previous }
})

test('F-03 classifies FREE into four types, preserves manual selection and fails safely to FREE', () => {
  const cases = [['정의와 개념은 무엇인가요?', 'CONCEPT'], ['users가 undefined 오류예요', 'DEBUGGING'], ['결제 버튼 중복을 어떻게 막죠?', 'PROBLEM_SOLVING'], ['캐시 대안의 장단점과 설계 판단', 'DESIGN']]
  for (const [question, expected] of cases) {
    assert.equal(classifyMockQuestion({ question, code: '', type: 'FREE' }).type, expected)
    assert.equal(classifyMockQuestion({ question, code: '', type: 'FREE' }).classification.source, 'MOCK_AUTO')
    for (const type of ['CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN']) {
      const manual = classifyMockQuestion({ question, code: '', type }, 'error')
      assert.equal(manual.type, type); assert.equal(manual.classification.source, 'USER')
    }
  }
  for (const scenario of ['error', 'invalid']) assert.deepEqual(classifyMockQuestion(rawDraft, scenario), { type: 'FREE', classification: { requestedType: 'FREE', source: 'FALLBACK' } })
  assert.equal(classifyMockQuestion({ question: '잘 모르겠어요', code: '', type: 'FREE' }).type, 'FREE')
})

test('server masks bypassed raw requests before persistence, replays safely, retains classification and protects locked outputs', async () => {
  const f = fixture()
  try {
    const body = { ...rawDraft, clientRequestId: 'secure-create' }
    const created = await request('/api/chats', body)
    assert.equal(created.status, 201); assert.equal(created.body.type, 'DEBUGGING')
    assert.equal(created.body.classification.requestedType, 'FREE')
    noSecrets(created.body); noAnswers(created.body); noSecrets(JSON.stringify([...f.db]))
    const path = '/api/chats/' + created.body.id
    assert.equal((await request('/api/chats', body)).body.id, created.body.id)
    f.reload(); assert.equal((await request('/api/chats', body)).body.id, created.body.id)
    const detail = (await request(path)).body
    assert.equal(detail.classification.source, 'MOCK_AUTO'); noSecrets(detail); noAnswers(detail)
    assert.equal((await request(path + '/result?resultId=guess')).status, 403)
    const saved = await request(path + '/thoughts', { thought, clientRequestId: 'secure-thought' })
    assert.equal(saved.status, 202); assert.equal(saved.body.thought, redactSecrets(thought).value)
    noSecrets(saved.body); noAnswers(saved.body); noSecrets(JSON.stringify([...f.db]))
    f.tick(100)
    const done = (await request(path + '/analysis')).body
    const result = (await request(path + '/result?resultId=' + done.resultId)).body
    noSecrets(result)
    for (const finding of result.findings) if (finding.userQuote) assert.equal(result.thought.includes(finding.userQuote), true)
  } finally { f.server.close() }
})

test('classification failure has no specific comparison axes; all manually selected types change comparison perspectives', async () => {
  let scenario = 'error'
  const f = fixture({ classificationScenario: () => scenario })
  try {
    for (const type of ['FREE', 'CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN']) {
      f.tick(0)
      const created = await request('/api/chats', { question: '내용을 확인해 볼게요', code: '', type, clientRequestId: crypto.randomUUID() })
      assert.equal(created.body.type, type)
      const path = '/api/chats/' + created.body.id
      await request(path + '/thoughts', { thought: '조건과 실행 순서를 먼저 정리하고 작은 예시에서 직접 값을 출력해서 비교해 볼게요.', clientRequestId: crypto.randomUUID() })
      f.tick(100)
      const done = (await request(path + '/analysis')).body
      const result = (await request(path + '/result?resultId=' + done.resultId)).body
      if (type === 'FREE') assert.equal(result.referenceAnswer.includes('확인할 관점:'), false)
      else for (const axis of questionPerspectives[type]) assert.equal(result.referenceAnswer.includes(axis), true)
    }
    scenario = 'invalid'
    const invalid = await request('/api/chats', { ...rawDraft, clientRequestId: 'invalid-classification' })
    assert.equal(invalid.body.type, 'FREE'); assert.equal(invalid.body.classification.source, 'FALLBACK')
  } finally { f.server.close() }
})

test('server revalidates lengths after masking, refuses invalid thought remnants and rejects forged classification metadata', async () => {
  const f = fixture()
  try {
    const tooLong = await request('/api/chats', { ...rawDraft, code: apiKey.repeat(200), clientRequestId: 'long-secret' })
    assert.equal(tooLong.status, 400)
    const { body: created } = await request('/api/chats', { ...rawDraft, clientRequestId: 'thought-short' })
    const response = await request('/api/chats/' + created.id + '/thoughts', { thought: apiKey, clientRequestId: 'secret-only' })
    assert.equal(response.status, 400)
    assert.equal((await request('/api/chats/' + created.id + '/analysis')).status, 403)
    assert.throws(() => readLockedChat({ ...created, classification: { source: 'USER', requestedType: 'FREE' } }))
    assert.throws(() => readLockedChat({ ...created, type: 'FREE' }))
  } finally { f.server.close() }
})
