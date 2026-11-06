import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { validateQuestion } from '../src/api/chatValidation.ts'
import { readLockedChat } from '../src/api/lockedChat.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'

const origin = 'http://localhost:9876'
const draft = { question: 'users가 undefined인 이유를 어디서부터 확인하면 될까요?', code: 'const users = undefined;', type: 'DEBUGGING' }

function assertSafe(value) {
  const text = JSON.stringify(value)
  for (const forbidden of ['referenceAnswer', 'findings', 'analysis', 'hints', 'useState([])']) assert.equal(text.includes(forbidden), false)
  assert.equal(value.status, 'LOCKED')
  assert.equal(value.choices.length, 3)
}

test('question and code validation includes exact bounds, blank input, UTF-16 length', () => {
  assert.ok(validateQuestion({ ...draft, question: ' \n ' }))
  assert.equal(validateQuestion({ ...draft, question: 'a'.repeat(2000), code: 'a'.repeat(6000) }), null)
  assert.ok(validateQuestion({ ...draft, question: 'a'.repeat(2001) }))
  assert.ok(validateQuestion({ ...draft, code: 'a'.repeat(6001) }))
  assert.equal(validateQuestion({ ...draft, question: '😀'.repeat(1000) }), null)
  assert.ok(validateQuestion({ ...draft, question: '😀'.repeat(1001) }))
})

test('locked decoder drops unapproved fields and rejects unlocked or malformed responses', () => {
  const safe = { ...draft, id: 'one', status: 'LOCKED', choices: ['a', 'b', 'c'], exampleSentence: '확인해 볼 문장' }
  assertSafe(readLockedChat({ ...safe, referenceAnswer: 'hidden', analysis: { result: 'hidden' } }))
  assert.throws(() => readLockedChat({ ...safe, status: 'UNLOCKED_SELF' }))
  assert.throws(() => readLockedChat({ ...safe, choices: ['a'] }))
})

test('MSW: same request creates one chat, locks detail, validates on server, conflicts on changed input', async () => {
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1 }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const post = body => fetch(origin + '/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const body = { ...draft, clientRequestId: 'duplicate' }
    const responses = await Promise.all([post(body), post(body)])
    assert.deepEqual(responses.map(r => r.status), [201, 201])
    const [a, b] = await Promise.all(responses.map(r => r.json()))
    assert.equal(a.id, b.id)
    assertSafe(a)
    const detail = await fetch(origin + '/api/chats/' + a.id)
    assertSafe(await detail.json())
    assert.equal((await post({ ...body, question: 'different' })).status, 409)
    assert.equal((await post({ ...body, clientRequestId: 'bad', code: 'x'.repeat(6001) })).status, 400)
    assert.equal((await post({ ...body, clientRequestId: 'blank', question: '   ' })).status, 400)
    assert.equal((await post({ ...body, clientRequestId: 'long', question: 'x'.repeat(2001) })).status, 400)
    assert.equal((await fetch(origin + '/api/chats/missing')).status, 404)
  } finally { server.close() }
})

test('MSW: error-once preserves request and can retry to locked result without duplication', async () => {
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, scenario: () => 'error-once' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const post = () => fetch(origin + '/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, clientRequestId: 'retry' }) })
    assert.equal((await post()).status, 503)
    const second = await post()
    assert.equal(second.status, 201)
    const chat = await second.json()
    assertSafe(chat)
    assert.equal((await (await post()).json()).id, chat.id)
  } finally { server.close() }
})
