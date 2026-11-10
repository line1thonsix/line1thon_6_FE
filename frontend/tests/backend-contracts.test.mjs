import test from 'node:test'
import assert from 'node:assert/strict'
import { readBackendLockState, readBackendTransition, backendPollTarget, readReleasedResult, assertNoResultContent, BACKEND_POLL_MS } from '../src/api/backend/lockState.ts'
import { backendPaths } from '../src/api/backend/contracts.ts'
import { validateBackendThought, validateBackendCreateChat, readBackendCreatedChat } from '../src/api/backend/validation.ts'
import { createBackendClient, guestTokenStore, BackendApiError } from '../src/api/backend/client.ts'
import { createBackendChat } from '../src/api/backend/chats.ts'
import { validateThought } from '../src/api/thoughtValidation.ts'
import { redactionOccurred } from '../src/security/redactionNotice.ts'

const lock = (change = {}) => ({ prepareStatus: 'DONE', status: 'LOCKED', hintLevel: 0, analysis: null, ...change })
const job = (mode = 'COMPARE', status = 'PENDING') => ({ mode, status })
const unlocked = mode => lock({ status: mode === 'COMPARE' ? 'UNLOCKED_SELF' : 'UNLOCKED_ASSISTED', hintLevel: mode === 'BASIC' ? 2 : 0, analysis: job(mode, 'DONE') })
const input = () => ({ clientRequestId: crypto.randomUUID(), type: 'DEBUGGING', question: '마지막 값이 왜 없을까요?', code: null, exampleId: null })
const receipt = (change = {}) => ({ chatId: 12, status: 'LOCKED', type: 'DEBUGGING', prepareStatus: 'PREPARING', secretMasked: false, createdAt: '2026-11-05T13:01:00+09:00', ...change })
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const memory = initial => { let value = initial; return { read: () => value, write: v => { value = v }, clear: () => { value = null } } }
const signal = () => new AbortController().signal
// Synthetic session fixture. `fixtureToken` is deliberately NOT asserted as BE DTO.
const decodeSession = raw => raw.fixtureToken

test('state-machine table permits all nine documented combinations with separate prepare/lock/hint/mode state', () => {
  const states = [lock({ prepareStatus: 'PREPARING' }), lock({ prepareStatus: 'FAILED' }), lock(),
    lock({ analysis: job() }), lock({ analysis: job('COMPARE', 'FAILED') }),
    lock({ hintLevel: 2, analysis: job('BASIC') }), lock({ hintLevel: 2, analysis: job('BASIC', 'FAILED') }), unlocked('COMPARE'), unlocked('BASIC')]
  for (const state of states) assert.deepEqual(readBackendLockState(state), state)
  assert.equal(BACKEND_POLL_MS, 2000)
  assert.equal(backendPollTarget(states[0]), 'chat')
  assert.equal(backendPollTarget(states[3]), 'analysis')
  for (const state of [states[1], states[2], states[4], states[7], states[8]]) assert.equal(backendPollTarget(state), null)
})
test('invalid combinations, deprecated HINT/unlockType and premature release fail closed; terminal paths cannot relock/switch', () => {
  for (const value of [null, {}, lock({ status: 'HINT' }), lock({ unlockType: 'SELF' }), lock({ hintLevel: '2' }), lock({ hintLevel: 3 }),
    lock({ prepareStatus: 'PREPARING', hintLevel: 1 }), lock({ prepareStatus: 'FAILED', analysis: job() }),
    lock({ analysis: job('BASIC') }), lock({ analysis: job('COMPARE', 'DONE') }),
    { ...unlocked('COMPARE'), analysis: job('BASIC', 'DONE') }, { ...unlocked('BASIC'), analysis: null }]) assert.throws(() => readBackendLockState(value))
  assert.throws(() => readBackendTransition(unlocked('COMPARE'), lock()))
  assert.throws(() => readBackendTransition(unlocked('COMPARE'), unlocked('BASIC')))
  assert.throws(() => readBackendTransition(lock({ hintLevel: 2 }), lock({ hintLevel: 1 })))
  assert.throws(() => readBackendTransition(lock(), lock({ prepareStatus: 'PREPARING' })))
  assert.deepEqual(readBackendTransition(lock({ hintLevel: 2, analysis: job() }), lock({ hintLevel: 2 })), lock({ hintLevel: 2 })) // normalized stop observation, no guessed wire endpoint
})
test('result decoder cannot run under LOCKED even if a caller claims analysis completion elsewhere', () => {
  let decoded = 0
  const decode = value => { decoded++; return value }
  assert.throws(() => readReleasedResult({ referenceAnswer: 'forbidden' }, lock(), decode))
  assert.equal(decoded, 0)
  assert.deepEqual(readReleasedResult({ referenceAnswer: 'allowed' }, unlocked('COMPARE'), decode), { referenceAnswer: 'allowed' })
  for (const raw of [{ referenceAnswer: null }, { nested: [{ findings: [] }] }, { analysis: { comparisonResult: {} } }, { score: 10 }]) assert.throws(() => assertNoResultContent(raw))
  assert.doesNotThrow(() => assertNoResultContent({ status: 'LOCKED', hintLevel: 2, analysis: { mode: 'BASIC', analysisStatus: 'PENDING' } }))
})
test('confirmed server validation counts entire trimmed thought and UTF-16 while existing manual-only Mock rule stays intact', () => {
  const valid = '서로 다른 조건을 나누고 작은 예시의 실제 값을 출력해서 확인하겠습니다.'
  assert.equal(validateBackendThought(valid), true)
  assert.equal(validateBackendThought(' ' + valid + '\n'), true)
  assert.equal(validateBackendThought('a'.repeat(30)), false)
  assert.equal(validateBackendThought('가나다라마바사아' + '가'.repeat(22)), true)
  assert.equal(validateBackendThought('가나다라마바사아' + '가'.repeat(1992)), true)
  assert.equal(validateBackendThought('가나다라마바사아' + '가'.repeat(1993)), false)
  assert.ok(validateThought(valid, '짧은 직접 입력')) // intentional current UI/Mock policy
  assert.equal(validateBackendThought('😀'.repeat(15)), false)
  validateBackendCreateChat({ ...input(), question: '  ' + '가'.repeat(2000) + ' ', code: ' ' + 'x'.repeat(6000) + '\n' })
  for (const change of [{ type: 'FREE' }, { code: 'x'.repeat(6001) }, { question: ' ' }, { question: '가'.repeat(2001) }, { clientRequestId: 'mock-id' }, { exampleId: 'unknown' }]) assert.throws(() => validateBackendCreateChat({ ...input(), ...change }))
})
test('create DTO uses numeric chatId, preparation receipt and explicit fields; no choices/results can be required or cached', () => {
  assert.deepEqual(readBackendCreatedChat({ ...receipt(), choices: ['extra'], arbitrary: 'drop' }, 201), receipt())
  assert.equal(readBackendCreatedChat(receipt({ prepareStatus: 'DONE' }), 200).prepareStatus, 'DONE')
  for (const change of [{ chatId: '12' }, { chatId: 0 }, { prepareStatus: 'DONE' }, { createdAt: '2026-11-05T04:01:00Z' }, { secretMasked: null }, { referenceAnswer: 'leaked' }]) assert.throws(() => readBackendCreatedChat(receipt(change), 201))
  assert.throws(() => readBackendCreatedChat(receipt(), 202))
  assert.equal(backendPaths.prepareRetry(12), '/chats/12/prepare/retry')
  assert.equal(backendPaths.basicMode(12), '/chats/12/basic-mode')
  assert.throws(() => backendPaths.chat('mock-uuid')); assert.throws(() => backendPaths.chat(-1))
})
test('backend transport is lazy, shares session issuance, sends header/no cookies and requires endpoint decoding', async () => {
  let sessions = 0, requests = 0
  const tokens = memory(null)
  const client = createBackendClient({ baseUrl: '/api', tokens, decodeSession, fetch: async (url, init) => {
    if (url === '/api/sessions') { sessions++; await Promise.resolve(); return response({ fixtureToken: 'guest-fixture' }, 201) }
    requests++; assert.equal(init.credentials, 'omit'); assert.equal(init.headers['X-Guest-Token'], 'guest-fixture'); assert.equal(init.headers['Content-Type'], 'application/json')
    return response({ safe: true, unwanted: 'drop' })
  } })
  assert.equal(sessions, 0); assert.equal(requests, 0)
  const read = () => client.request('/chats', { method: 'GET', signal: signal(), decode: v => ({ safe: v.safe }) })
  assert.deepEqual(await Promise.all([read(), read()]), [{ safe: true }, { safe: true }])
  assert.equal(sessions, 1); assert.equal(requests, 2)
})
test('INVALID_TOKEN reissues once without replaying a mutation; delayed old 401 does not erase newer credentials', async () => {
  const tokens = memory('old'), pending = []
  let sessions = 0, mutations = 0
  const client = createBackendClient({ baseUrl: 'https://backend.example.test/api/', tokens, decodeSession, fetch: async (url, init) => {
    if (url.endsWith('/sessions')) { sessions++; return response({ fixtureToken: 'new' }) }
    mutations++; assert.equal(init.headers['X-Guest-Token'], 'old')
    return new Promise(resolve => pending.push(resolve))
  } })
  const request = () => client.request('/chats', { method: 'POST', body: { clientRequestId: 'preserve' }, signal: signal(), decode: v => v }).then(() => assert.fail(), error => error)
  const a = request(), b = request()
  await new Promise(resolve => setImmediate(resolve))
  const invalid = () => response({ code: 'INVALID_TOKEN', message: 'invalid', requestId: 'req-1' }, 401)
  pending[0](invalid()); const first = await a
  assert.equal(first.code, 'INVALID_TOKEN'); assert.equal(first.requestId, 'req-1'); assert.equal(tokens.read(), 'new')
  pending[1](invalid()); await b
  assert.equal(tokens.read(), 'new'); assert.equal(sessions, 1); assert.equal(mutations, 2)
})
test('404 CHAT_NOT_FOUND does not renew session or fall back to Mock; malformed error bodies stay typed', async () => {
  const tokens = memory('guest')
  const client = createBackendClient({ baseUrl: '/api', tokens, decodeSession, fetch: async url => { assert.equal(url, '/api/chats/12'); return response({ code: 'CHAT_NOT_FOUND', message: '없음', requestId: 'req' }, 404) } })
  await assert.rejects(client.request('/chats/12', { method: 'GET', signal: signal(), decode: v => v }), error => error instanceof BackendApiError && error.status === 404 && error.code === 'CHAT_NOT_FOUND')
  assert.equal(tokens.read(), 'guest')
  const bad = createBackendClient({ baseUrl: '/api', tokens, decodeSession, fetch: async () => new Response('bad', { status: 500 }) })
  await assert.rejects(bad.request('/chats', { method: 'GET', signal: signal(), decode: v => v }), error => error.code === 'INVALID_RESPONSE' && error.status === 500)
})
test('aborted caller does not start I/O or cancel another caller shared session bootstrap', async () => {
  let finish, calls = 0
  const client = createBackendClient({ baseUrl: '/api', tokens: memory(null), decodeSession, fetch: async url => {
    calls++; if (url.endsWith('/sessions')) return new Promise(resolve => { finish = () => resolve(response({ fixtureToken: 'guest' })) })
    return response({ ok: true })
  } })
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(client.request('/chats', { method: 'GET', signal: aborted.signal, decode: v => v })); assert.equal(calls, 0)
  const one = new AbortController()
  const a = client.request('/chats', { method: 'GET', signal: one.signal, decode: v => v }).catch(error => error)
  const b = client.request('/chats', { method: 'GET', signal: signal(), decode: v => v })
  one.abort(); finish(); await a; assert.deepEqual(await b, { ok: true }); assert.equal(calls, 2)
})
test('confirmed create adapter masks secrets, keeps request UUID, and returns PREPARING instead of a Mock locked screen', async () => {
  const original = input(), secret = 'sk-' + 'a'.repeat(40)
  const client = createBackendClient({ baseUrl: '/api', tokens: memory('guest'), decodeSession, fetch: async (url, init) => {
    assert.equal(url, '/api/chats'); const body = JSON.parse(init.body)
    assert.equal(body.clientRequestId, original.clientRequestId); assert.equal(body.code.includes(secret), false); assert.ok(body.code.includes('[REDACTED]'))
    assert.equal('suggestion' in body, false); return response(receipt(), 201)
  } })
  const result = await createBackendChat(client, { ...original, code: 'const key = "' + secret + '"' }, signal())
  assert.equal(redactionOccurred(), true); assert.equal(result.prepareStatus, 'PREPARING'); assert.equal('choices' in result, false)
  await assert.rejects(createBackendChat(client, { ...original, type: 'FREE' }, signal()))
})
test('guest token store is separate from Mock workspace; invalid routes and unsupported mutations fail before I/O', async () => {
  const db = new Map([['deveil:mock:workspace:v1', 'keep']])
  const tokens = guestTokenStore({ getItem: key => db.get(key) ?? null, setItem: (key, v) => db.set(key, v), removeItem: key => db.delete(key) })
  tokens.write('guest'); tokens.clear(); assert.equal(db.get('deveil:mock:workspace:v1'), 'keep')
  const client = createBackendClient({ baseUrl: '/api', tokens, decodeSession, fetch: () => assert.fail('unexpected I/O') })
  for (const path of ['https://other.test', '//other.test', '/../sessions', '/bad#fragment']) await assert.rejects(client.request(path, { method: 'GET', signal: signal(), decode: v => v }))
  await assert.rejects(client.request('/chats/12', { method: 'DELETE', signal: signal(), decode: v => v }))
})
