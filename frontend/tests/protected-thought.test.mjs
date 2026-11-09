import test from 'node:test'
import assert from 'node:assert/strict'
import { attachThoughtProtection } from '../src/api/protectedThoughtInput.ts'
import { editThoughtDraft, readThoughtDraft, toggleChoice, manualThought, thoughtSubmission } from '../src/api/thoughtDraft.ts'
import { validateThought, THOUGHT_GUIDANCE, THOUGHT_TOO_LONG } from '../src/api/thoughtValidation.ts'
import { setupServer } from 'msw/node'
import { createChatHandlers } from '../src/mocks/handlers.ts'

const chat = { choices: ['입력 조건', '실행 순서', '예외 처리'], exampleSentence: '이 예시는 기존대로 직접 편집할 수 있어요.' }
const selected = (manual = '') => toggleChoice(readThoughtDraft(manual, chat), chat, 0)
function event(type, fields = {}, cancelable = true) {
  return Object.assign(new Event(type, { cancelable }), fields)
}
class Textarea extends EventTarget {
  value = ''; selectionStart = 0; selectionEnd = 0
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end }
}
function editor(initial = selected()) {
  let draft = initial
  let enabled = true
  const input = new Textarea()
  input.value = draft.text
  input.setSelectionRange(draft.text.length, draft.text.length)
  const detach = attachThoughtProtection(input, {
    enabled: () => enabled, getDraft: () => draft, restore: next => { draft = next },
  })
  return {
    input, detach, draft: () => draft, enabled: value => { enabled = value },
    choose(index) { draft = toggleChoice(draft, chat, index); input.value = draft.text; input.setSelectionRange(draft.text.length, draft.text.length) },
    edit(type, text = '', start = input.selectionStart, end = input.selectionEnd, cancelable = true) {
      input.setSelectionRange(start, end)
      const before = event('beforeinput', { inputType: type, data: text }, cancelable)
      input.dispatchEvent(before)
      if (before.defaultPrevented) return false
      if (start === end && type === 'deleteContentBackward') start = Math.max(0, start - 1)
      if (start === end && type === 'deleteContentForward') end = Math.min(input.value.length, end + 1)
      input.value = input.value.slice(0, start) + text + input.value.slice(end)
      input.setSelectionRange(start + text.length, start + text.length)
      input.dispatchEvent(event('input', { inputType: type, data: text }, false))
      return true
    },
    key(key, fields = {}) { const e = event('keydown', { key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, ...fields }); input.dispatchEvent(e); return e },
  }
}

test('Backspace/Delete, selection replacement, paste and cut cannot mutate the protected choice', () => {
  for (const type of ['insertText', 'insertFromPaste', 'insertReplacementText', 'insertFromDrop', 'deleteContentBackward', 'deleteContentForward', 'deleteWordBackward']) {
    const e = editor()
    const original = e.draft().text
    e.edit(type, type.startsWith('insert') ? '수정' : '', 3, 8)
    assert.equal(e.input.value, original, type)
    assert.equal(e.draft().text, original, type)
    e.detach()
  }
  const e = editor()
  assert.equal(e.edit('deleteContentBackward', '', e.input.value.length), false)
  assert.equal(e.edit('deleteContentForward', '', 0), false)
  e.input.setSelectionRange(0, e.input.value.length)
  for (const type of ['paste', 'cut', 'dragstart']) {
    const action = event(type)
    e.input.dispatchEvent(action)
    assert.equal(action.defaultPrevented, true, type)
  }
  e.detach()
})

test('manual input before/after the choice and manual paste/deletion stay editable; no text is truncated', () => {
  const e = editor()
  const automatic = e.input.value
  e.edit('insertFromPaste', '한글로 직접 작성한 생각입니다. 😀');
  assert.equal(e.input.value, automatic + '한글로 직접 작성한 생각입니다. 😀')
  assert.equal(manualThought(e.draft()), '한글로 직접 작성한 생각입니다. 😀')
  e.edit('insertText', '앞에서 적은 생각 ', 0, 0)
  assert.equal(e.input.value, '앞에서 적은 생각 ' + automatic + '한글로 직접 작성한 생각입니다. 😀')
  e.edit('deleteContentBackward')
  assert.ok(e.input.value.includes(automatic))
  e.edit('insertFromPaste', 'a'.repeat(2100), e.input.value.length, e.input.value.length)
  assert.ok(e.input.value.length > 2100)
  assert.equal(validateThought(e.input.value, manualThought(e.draft())), THOUGHT_TOO_LONG)
  e.detach()
})

test('non-cancelable input/spellcheck that changes the choice is restored before it can reach saved state', () => {
  const e = editor()
  const automatic = e.draft().text
  e.edit('insertReplacementText', '덮어쓰기', 0, automatic.length, false)
  assert.equal(e.input.value, automatic)
  assert.equal(e.draft().text, automatic)
  e.detach()
})

test('Korean composition begins after the choice, preserves intermediate/final syllables, and is one undo step', () => {
  const e = editor()
  const automatic = e.input.value
  e.input.setSelectionRange(2, 5)
  e.input.dispatchEvent(event('compositionstart', {}, false))
  assert.equal(e.input.selectionStart, automatic.length)
  e.edit('insertCompositionText', 'ㅎ', automatic.length, automatic.length, false)
  e.edit('insertCompositionText', '하', automatic.length, automatic.length + 1, false)
  e.edit('insertCompositionText', '한', automatic.length, automatic.length + 1, false)
  const enter = e.key('Enter', { isComposing: true, ctrlKey: false })
  assert.equal(enter.defaultPrevented, false)
  e.input.dispatchEvent(event('compositionend', {}, false))
  assert.equal(e.input.value, automatic + '한')
  e.key('z')
  assert.equal(e.input.value, automatic)
  e.key('z', { shiftKey: true })
  assert.equal(e.input.value, automatic + '한')
  assert.equal(manualThought(e.draft()), '한')
  e.detach()
})

test('undo/redo only restores manual edits, including menu/native history and history after choice changes', () => {
  const e = editor()
  const automatic = e.input.value
  e.edit('insertText', '처음 생각')
  e.edit('insertFromPaste', ' 추가 생각')
  assert.equal(e.key('z').defaultPrevented, true)
  assert.equal(e.input.value, automatic + '처음 생각')
  e.edit('historyUndo')
  assert.equal(e.input.value, automatic)
  e.edit('historyRedo')
  assert.equal(e.input.value, automatic + '처음 생각')
  // A browser may emit a non-cancelable undo that tries to remove everything.
  e.edit('historyUndo', '', 0, e.input.value.length, false)
  assert.equal(e.input.value, automatic)
  e.edit('insertText', '새로운 직접 작성')
  e.choose(1)
  const replaced = e.input.value
  e.key('z'); e.key('y')
  assert.equal(e.input.value, replaced)
  assert.ok(!e.input.value.includes(chat.choices[0]))
  e.choose(1)
  const plain = e.input.value
  e.key('z')
  assert.equal(e.input.value, plain)
  e.detach()
})

test('manual-only 29/30 boundaries, distinct 7/8, full 2000/2001, and persisted selection remain consistent', () => {
  const automatic = selected()
  for (const [manual, expected] of [['abcdefgh' + 'a'.repeat(21), THOUGHT_GUIDANCE], ['abcdefgh' + 'a'.repeat(22), null], ['abcdefg'.repeat(5), THOUGHT_GUIDANCE], ['a'.repeat(30), THOUGHT_GUIDANCE]]) {
    const next = editThoughtDraft(automatic, automatic.text + manual)
    assert.equal(validateThought(next.text, manualThought(next)), expected)
    const restored = readThoughtDraft(JSON.parse(JSON.stringify(next)), chat)
    assert.deepEqual(restored, next)
    assert.equal(editThoughtDraft(restored, '').text, next.text)
    assert.equal(toggleChoice(restored, chat, 0).text, manual)
  }
})

test('Mock recomputes manual-only validation from trusted choice text, rejects forged ranges and keeps failed submissions locked', async () => {
  const origin = 'http://localhost:9889'
  const server = setupServer(...createChatHandlers({ origin, delayMs: 1, thoughtScenario: () => 'error-once' }))
  server.listen({ onUnhandledFrame: 'error' })
  const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const locked = await (await post('/api/chats', { question: '어떤 조건을 확인할까요?', code: '', type: 'FREE', clientRequestId: 'protected-chat' })).json()
    const path = '/api/chats/' + locked.id
    const base = toggleChoice(readThoughtDraft('', locked), locked, 0)
    const invalid = ['abcdefgh'.repeat(3), 'a'.repeat(30), 'abcdefg'.repeat(5)]
    for (const manual of invalid) {
      const draft = editThoughtDraft(base, base.text + manual)
      const response = await post(path + '/thoughts', { ...thoughtSubmission(draft), clientRequestId: crypto.randomUUID() })
      assert.equal(response.status, 400)
      assert.equal((await fetch(origin + path + '/analysis')).status, 403)
    }
    const manual = 'abcdefgh' + 'a'.repeat(22)
    const valid = editThoughtDraft(base, base.text + manual)
    const body = { ...thoughtSubmission(valid), clientRequestId: 'protected-thought' }
    for (const suggestion of [null, { index: 0, start: -1, end: 1 }, { ...body.suggestion, end: body.thought.length }, { ...body.suggestion, index: 2 }]) {
      assert.equal((await post(path + '/thoughts', { ...body, suggestion })).status, 400)
    }
    assert.equal((await post(path + '/thoughts', body)).status, 503)
    const saved = await (await fetch(origin + path)).json()
    assert.equal(saved.thought, body.thought)
    assert.equal('referenceAnswer' in saved, false)
    assert.equal((await post(path + '/thoughts', body)).status, 202)
  } finally { server.close() }
})
