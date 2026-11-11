import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackendClient, BackendApiError } from '../src/api/backend/client.ts'
import { createBackendChat } from '../src/api/backend/chats.ts'
import { backendWorkspaceApi, readChatDetail, readGuestToken, readHintReceipt, readThoughtReceipt } from '../src/api/backend/workspaceApi.ts'
import { backendPollTarget, readBackendTransition } from '../src/api/backend/lockState.ts'

const createdAt = '2026-11-11T14:00:00+09:00'
const draft = { clientRequestId: '12345678-abcd-abcd-abcd-123456789abc', type: 'DEBUGGING', question: '배열 값이 undefined인 이유는 무엇인가요?', code: null, exampleId: null }
const pending = { jobId: 2, mode: 'COMPARE', status: 'PENDING', retryCount: 0, remainingRetries: 2 }
const thought = '배열의 길이보다 마지막 인덱스가 하나 작기 때문에 반복 조건을 확인하고 싶어요.'
const detail = extra => ({
  chatId: 1, question: draft.question, type: draft.type, code: null, status: 'LOCKED', prepareStatus: 'DONE',
  choices: ['배열 길이', '초기값', '반복 조건'], secretMasked: false, hints: [], hintLevel: 0, hasNextHint: true,
  basicModeAvailable: false, thought: null, analysis: null, createdAt, ...extra,
})
const json = (data, status = 200) => Response.json(data, { status })
const invalid = () => json({ code: 'INVALID_TOKEN', message: '만료', requestId: 'req_expired' }, 401)
const signal = () => new AbortController().signal
function clientWith(fetch, initial = null) {
  let current = initial
  const tokens = { read: () => current, write: value => { current = value }, clear: () => { current = null } }
  return { tokens, client: createBackendClient({ baseUrl: 'https://example.test/api', tokens, decodeSession: readGuestToken, fetch }) }
}

test('six Railway routes use the deployed body shapes and detail polling tracks preparation and analysis separately', async () => {
  const expected = [
    ['POST', '/sessions', undefined, null, json({ guestToken: 'owner', createdAt }, 201)],
    ['POST', '/chats', draft, 'owner', json({ chatId: 1, status: 'LOCKED', type: draft.type, prepareStatus: 'PREPARING', secretMasked: false, createdAt }, 201)],
    ['GET', '/chats/1', undefined, 'owner', json(detail({ prepareStatus: 'PREPARING', choices: null }))],
    ['GET', '/chats/1', undefined, 'owner', json(detail({ prepareStatus: 'FAILED', choices: null }))],
    ['POST', '/chats/1/prepare/retry', undefined, 'owner', json({ chatId: 1, prepareStatus: 'PREPARING' }, 202)],
    ['GET', '/chats/1', undefined, 'owner', json(detail())],
    ['POST', '/chats/1/hints', undefined, 'owner', json({ hintLevel: 1, hint: '인덱스가 시작하는 값을 살펴보세요.', hasNextHint: true, basicModeAvailable: false })],
    ['POST', '/chats/1/thoughts', { content: thought, selectedChoice: 0 }, 'owner', json({ jobId: 2, mode: 'COMPARE', analysisStatus: 'PENDING', status: 'LOCKED', hintUsed: true }, 202)],
    ['GET', '/chats/1', undefined, 'owner', json(detail({ thought, analysis: pending }))],
    ['GET', '/chats/1', undefined, 'owner', json(detail({ thought, analysis: { ...pending, status: 'DONE' }, status: 'UNLOCKED_SELF' }))],
  ]
  const { client } = clientWith(async (url, init) => {
    assert.ok(expected.length, 'no unsupported route is called')
    const [method, path, body, guest, response] = expected.shift()
    assert.equal(url, 'https://example.test/api' + path)
    assert.equal(init.method, method)
    assert.deepEqual(init.body === undefined ? undefined : JSON.parse(init.body), body)
    assert.equal(new Headers(init.headers).get('X-Guest-Token'), guest)
    assert.equal(init.credentials, 'omit')
    return response
  })
  const guest = await client.ensureSession(signal())
  const api = backendWorkspaceApi(client, guest, signal())
  const receipt = await createBackendChat(client, draft, signal(), guest)
  const preparing = await api.detail(receipt.chatId)
  assert.equal(backendPollTarget(preparing), 'chat')
  assert.deepEqual(preparing.choices, [])
  assert.equal((await api.detail(1)).prepareStatus, 'FAILED')
  await api.retryPrepare(1)
  assert.equal((await api.detail(1)).prepareStatus, 'DONE')
  assert.equal((await api.hint(1, 1)).level, 1)
  await api.submitThought(1, { content: thought, selectedChoice: 0 })
  const running = await api.detail(1)
  assert.equal(running.status, 'LOCKED')
  assert.equal(backendPollTarget(running), 'analysis')
  const complete = await api.detail(1)
  assert.equal(readBackendTransition(running, complete).status, 'UNLOCKED_SELF')
  assert.equal(backendPollTarget(complete), null)
  assert.equal(expected.length, 0)
})

test('protected fields, undisclosed hints, unexpected owners and inconsistent release states are rejected', () => {
  assert.throws(() => readChatDetail(detail({ analysis: { ...pending, result: { referenceAnswer: 'private' } } }), 1))
  assert.throws(() => readChatDetail(detail({ hints: [{ level: 1, text: 'hidden' }] }), 1))
  assert.throws(() => readChatDetail(detail(), 2))
  assert.throws(() => readChatDetail(detail({ status: 'UNLOCKED_SELF', analysis: pending }), 1))
  assert.throws(() => readHintReceipt({ hintLevel: 2, hint: 'hidden', hasNextHint: false }, 1))
  assert.throws(() => readThoughtReceipt({ jobId: 2, mode: 'COMPARE', analysisStatus: 'PENDING', status: 'UNLOCKED_SELF' }, 202))
})

test('invalid guest is renewed but old reads and mutations cannot be replayed under the replacement', async () => {
  const calls = []
  const { client, tokens } = clientWith(async (url, init) => {
    calls.push([url, init.method])
    if (url.endsWith('/sessions')) return json({ guestToken: 'new-owner', createdAt }, 201)
    return invalid()
  }, 'old-owner')
  const old = backendWorkspaceApi(client, 'old-owner', signal())
  await assert.rejects(old.submitThought(1, { content: thought, selectedChoice: null }),
    error => error instanceof BackendApiError && error.code === 'INVALID_TOKEN' && error.requestId === 'req_expired')
  assert.equal(tokens.read(), 'new-owner')
  await assert.rejects(old.detail(1), { code: 'GUEST_CHANGED' })
  await assert.rejects(old.hint(1, 1), { code: 'GUEST_CHANGED' })
  assert.deepEqual(calls, [['https://example.test/api/chats/1/thoughts', 'POST'], ['https://example.test/api/sessions', 'POST']])
})

test('a successful response arriving after a guest change is discarded', async () => {
  let finish
  const { client, tokens } = clientWith(() => new Promise(resolve => { finish = resolve }), 'owner')
  const inFlight = backendWorkspaceApi(client, 'owner', signal()).detail(1)
  tokens.write('replacement')
  finish(json(detail()))
  await assert.rejects(inFlight, { code: 'GUEST_CHANGED' })
})

test('renewal failure still reports the invalid owner and keeps the old token cleared', async () => {
  const { client, tokens } = clientWith(async url => url.endsWith('/sessions')
    ? json({ code: 'UNAVAILABLE', message: '오류', requestId: 'req_retry' }, 503)
    : invalid(), 'owner')
  await assert.rejects(backendWorkspaceApi(client, 'owner', signal()).detail(1), { code: 'INVALID_TOKEN', requestId: 'req_expired' })
  assert.equal(tokens.read(), null)
})
