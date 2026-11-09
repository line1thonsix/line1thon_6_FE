import test from 'node:test'
import assert from 'node:assert/strict'
import { setupServer } from 'msw/node'
import { choiceSentence, editThoughtDraft, readThoughtDraft, toggleChoice, manualThought, thoughtSubmission } from '../src/api/thoughtDraft.ts'
import { appendThought, validateThought, THOUGHT_GUIDANCE, THOUGHT_TOO_LONG } from '../src/api/thoughtValidation.ts'
import { readSession, writeSession, thoughtKey } from '../src/storage/session.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'

const chat = { choices: ['입력 조건', '실행 순서', '예외 처리'], exampleSentence: '작은 예시에서 입력과 출력의 차이가 나는 지점을 먼저 확인해 볼게요.' }
const manual = '입력 조건과 실행 순서를 기록한 뒤 작은 예시를 실행해서 예상한 값과 실제 값을 비교해 볼게요.'
const initial = (text = manual) => readThoughtDraft(text, chat)

test('three choices toggle off or replace one another without accumulating phrases or deleting manual text', () => {
  let draft = initial()
  for (const index of [0, 1, 2, 0]) {
    draft = toggleChoice(draft, chat, index)
    assert.equal(draft.choiceIndex, index)
    assert.equal(draft.text, appendThought(manual, choiceSentence(chat, index)))
  }
  draft = toggleChoice(draft, chat, 0)
  assert.equal(draft.choiceIndex, null)
  assert.equal(draft.text, manual)
  assert.deepEqual(toggleChoice(draft, chat, 99), draft)
})

test('matching words typed by the user are never mistaken for the inserted phrase', () => {
  const own = `직접 쓴 문장: ${choiceSentence(chat, 0)}이 문장은 남겨 주세요.`
  let draft = toggleChoice(initial(own), chat, 0)
  draft = editThoughtDraft(draft, `머리말\n${draft.text}`)
  draft = editThoughtDraft(draft, draft.text + '직접 덧붙인 이유')
  draft = toggleChoice(draft, chat, 1)
  assert.equal(draft.text, `머리말\n${own} ${choiceSentence(chat, 1)}직접 덧붙인 이유`)
  draft = toggleChoice(draft, chat, 1)
  assert.equal(draft.text, `머리말\n${own}직접 덧붙인 이유`)
})

test('choice text cannot be replaced, removed or cleared through the textarea', () => {
  const selected = toggleChoice(initial(), chat, 0)
  const start = selected.text.indexOf('부터 볼게요.')
  const edited = editThoughtDraft(selected, selected.text.replace('부터 볼게요.', '를 직접 확인하겠어요.'), { before: selected.text, start, end: start + '부터 볼게요.'.length })
  assert.equal(edited, selected)
  for (const text of ['', '완전히 새로 작성한 문장입니다.']) assert.equal(editThoughtDraft(selected, text), selected)
  const cleared = toggleChoice(selected, chat, 0)
  assert.equal(cleared.text, manual)
  assert.equal(editThoughtDraft(cleared, '').text, '')
})

test('example insertion stays editable and independent from the three choice toggles', () => {
  let draft = toggleChoice(initial(), chat, 0)
  draft = editThoughtDraft(draft, appendThought(draft.text, chat.exampleSentence))
  draft = toggleChoice(draft, chat, 0)
  assert.equal(draft.text, manual + chat.exampleSentence)
  assert.equal(validateThought(chat.exampleSentence), null)
})

test('refresh restores selected range ownership; legacy string and split-editor drafts retain all text', () => {
  const previous = globalThis.sessionStorage
  const map = new Map()
  globalThis.sessionStorage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  try {
    const key = thoughtKey('choice-refresh')
    for (const index of [0, 1, 2]) {
      const draft = toggleChoice(initial(), chat, index)
      writeSession(key, draft)
      const restored = readThoughtDraft(readSession(key), chat)
      assert.deepEqual(restored, draft)
      assert.equal(toggleChoice(restored, chat, index).text, manual)
      const legacy = readThoughtDraft({ version: 2, manual, completion: { kind: 'choice', index } }, chat)
      assert.equal(legacy.text, appendThought(choiceSentence(chat, index), manual))
      assert.equal(toggleChoice(legacy, chat, index).text, manual)
    }
    assert.equal(readThoughtDraft(manual, chat).text, manual)
    const example = readThoughtDraft({ version: 2, manual, completion: { kind: 'example' } }, chat)
    assert.equal(example.text, appendThought(chat.exampleSentence, manual))
    assert.equal(example.choiceIndex, null)
    const corrupt = readThoughtDraft({ version: 3, text: manual, choiceIndex: 0, owned: [true] }, chat)
    assert.equal(corrupt.text, manual)
    assert.equal(corrupt.choiceIndex, null)
  } finally { globalThis.sessionStorage = previous }
})

test('validation excludes the choice for minimum length/distinct characters, and includes it in the 2000 limit', () => {
  const shortManual = 'abcdefgh'.repeat(3)
  assert.equal(shortManual.length, 24)
  const selected = toggleChoice(initial(shortManual), chat, 0)
  assert.equal(validateThought(shortManual), THOUGHT_GUIDANCE)
  assert.equal(validateThought(selected.text, manualThought(selected)), THOUGHT_GUIDANCE)
  assert.equal(validateThought(toggleChoice(selected, chat, 0).text), THOUGHT_GUIDANCE)
  const empty = toggleChoice(initial(''), chat, 0)
  const boundary = editThoughtDraft(empty, empty.text + 'a'.repeat(2000 - empty.text.length))
  assert.equal(validateThought(boundary.text), null)
  assert.equal(validateThought(boundary.text + 'a'), THOUGHT_TOO_LONG)
})

test('Mock checks manual-only minimum; failed ack/retry keeps one locked job', async () => {
  const origin = 'http://localhost:9888'
  const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, thoughtScenario: () => 'error-once' }))
  server.listen({ onUnhandledFrame: 'error' })
  try {
    const created = await post('/api/chats', { question: '어떤 조건을 먼저 확인할까요?', code: '', type: 'FREE', clientRequestId: crypto.randomUUID() })
    const locked = await created.json()
    const path = '/api/chats/' + locked.id
    const shortDraft = toggleChoice(readThoughtDraft('abcdefgh'.repeat(3), locked), locked, 1)
    const rejected = await post(path + '/thoughts', { ...thoughtSubmission(shortDraft), clientRequestId: 'short-choice' })
    assert.equal(rejected.status, 400)
    const draft = toggleChoice(readThoughtDraft(manual, locked), locked, 1)
    const body = { ...thoughtSubmission(draft), clientRequestId: 'choice-request' }
    assert.equal(validateThought(body.thought), null)
    assert.equal((await post(path + '/thoughts', body)).status, 503)
    const restored = await (await fetch(origin + path)).json()
    assert.equal(restored.thought, body.thought)
    const responses = await Promise.all([post(path + '/thoughts', body), post(path + '/thoughts', body)])
    assert.deepEqual(responses.map(r => r.status), [202, 202])
    const [first, second] = await Promise.all(responses.map(r => r.json()))
    assert.deepEqual(first, second)
    assert.equal(first.analysis.jobId, restored.analysis.jobId)
    assert.equal(first.status, 'LOCKED')
    assert.equal('referenceAnswer' in first, false)
    assert.equal('findings' in first, false)
  } finally { server.close() }
})
