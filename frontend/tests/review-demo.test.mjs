import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDemoNotes, demoNotesKey, readDemoNotes, validateDemoNote } from '../src/storage/postResultDemo.ts'
import { displayedHint, readViewedHint } from '../src/api/hintNavigation.ts'
import { createChatHandlers } from '../src/mocks/handlers.ts'
import { setupServer } from 'msw/node'

let vite, PostResultNotesView, HintPanel, BasicLearningResult
before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ PostResultNotesView } = await vite.ssrLoadModule('/src/components/chat/PostResultNotes.tsx'))
  ;({ HintPanel } = await vite.ssrLoadModule('/src/components/chat/HintPanel.tsx'))
  ;({ BasicLearningResult } = await vite.ssrLoadModule('/src/components/chat/BasicLearningResult.tsx'))
})
after(async () => { await vite?.close() })
function demo(allowFeedback = true) {
  let saved = null, writable = true
  const storage = { read: () => structuredClone(saved), write: state => { if (!writable) return false; saved = structuredClone(state); return true } }
  return { controller: createDemoNotes('chat', allowFeedback, storage), reload: () => createDemoNotes('chat', allowFeedback, storage), writable: value => { writable = value }, saved: () => saved }
}
const renderNotes = (state, allowFeedback = true) => renderToStaticMarkup(createElement(PostResultNotesView, { state, allowFeedback, onOpen() {}, onChange() {}, onSubmit() {} }))

test('frontend-only reflection/feedback have independent drafts and completion, survive reload, overwrite reflection, and suppress duplicate submit', () => {
  const f = demo(), c = f.controller
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Demo notes must never make an API request') }
  try {
    c.open('reflection'); c.change('입력 전 조건을 먼저 확인해 볼래요.')
    c.open('feedback'); c.change('다른 입력 조건도 고려하면 좋겠어요.')
    assert.equal(c.getState().drafts.reflection, '입력 전 조건을 먼저 확인해 볼래요.')
    let restored = f.reload()
    assert.equal(restored.getState().active, 'feedback')
    assert.equal(restored.submit(), true)
    assert.equal(restored.submit(), false)
    restored.open('reflection'); assert.equal(restored.submit(), true)
    assert.deepEqual(restored.getState().order, ['feedback', 'reflection'])
    restored.open('reflection'); restored.change('입력과 실행 순서를 함께 확인해 볼래요.'); restored.submit()
    assert.equal(restored.getState().order.length, 2)
    assert.equal(restored.getState().saved.reflection, '입력과 실행 순서를 함께 확인해 볼래요.')
    assert.equal(restored.getState().saved.feedback, '다른 입력 조건도 고려하면 좋겠어요.')
    assert.equal(f.reload().getState().saved.reflection, restored.getState().saved.reflection)
  } finally { globalThis.fetch = originalFetch }
})

test('notes reject whitespace and exact over-limit input without losing drafts; valid 200/2000 limits save', () => {
  assert.ok(validateDemoNote('reflection', ' \n '))
  for (const [kind, limit] of [['reflection', 200], ['feedback', 2000]]) {
    const c = demo().controller
    c.open(kind); c.change('a'.repeat(limit + 1)); assert.equal(c.submit(), false)
    assert.equal(c.getState().drafts[kind].length, limit + 1)
    assert.equal(c.getState().saved[kind], null)
    c.change('a'.repeat(limit)); assert.equal(c.submit(), true)
    assert.equal(c.getState().saved[kind].length, limit)
  }
})

test('storage failure keeps writing state and draft, does not claim completion, and permits retry', () => {
  const f = demo(), c = f.controller
  c.open('reflection'); c.change('저장 실패에도 이 내용은 남아 있어요.')
  f.writable(false)
  assert.equal(c.submit(), false)
  assert.equal(c.getState().active, 'reflection')
  assert.equal(c.getState().saved.reflection, null)
  assert.ok(c.getState().error)
  assert.ok(c.getState().drafts.reflection.includes('이 내용은 남아'))
  f.writable(true); assert.equal(c.submit(), true)
  assert.equal(c.getState().error, '')
})

test('demo persistence masks secrets, ignores malformed/extra result fields and isolates chat keys; BASIC has reflection only', () => {
  const f = demo(), c = f.controller
  const secret = 'sk-' + 'a'.repeat(40)
  c.open('feedback'); c.change('키는 ' + secret); c.submit()
  assert.equal(JSON.stringify(f.saved()).includes(secret), false)
  assert.ok(c.getState().saved.feedback.includes('[REDACTED]'))
  const parsed = readDemoNotes({ ...f.saved(), referenceAnswer: 'must not store', order: ['feedback', 'feedback', 'unknown'] })
  assert.equal('referenceAnswer' in parsed, false)
  assert.deepEqual(parsed.order, ['feedback'])
  assert.notEqual(demoNotesKey('a'), demoNotesKey('b'))
  const basic = demo(false).controller
  basic.open('feedback'); assert.equal(basic.getState().active, null)
  basic.open('reflection'); basic.change('기초 개념을 확인했어요.'); assert.equal(basic.submit(), true)
})

test('Figma initial/writing/done states render sky input, selected action and saved bubble without changing the completed question composer', () => {
  const c = demo().controller
  let html = renderNotes(c.getState())
  assert.ok(html.includes('배운 점 한 줄 남기기'))
  assert.ok(html.includes('의견 남기기'))
  assert.doesNotMatch(html, /시연용|이 탭에만 저장/u)
  assert.equal(html.includes('<textarea'), false)
  c.open('reflection'); html = renderNotes(c.getState())
  assert.ok(html.includes('새롭게 알게 된 점이나 다음에 확인할 것을 한 줄로 남겨 주세요.'))
  assert.match(html, /<button\b[^>]*aria-label="회고 저장"[^>]*disabled/u)
  assert.ok(html.includes('aria-pressed="true"'))
  c.change('작은 입력 조건부터 확인해 볼래요.'); html = renderNotes(c.getState())
  assert.doesNotMatch(html, /<button\b[^>]*aria-label="회고 저장"[^>]*disabled/u)
  c.submit(); html = renderNotes(c.getState())
  assert.ok(html.includes('회고가 저장되었어요.'))
  assert.ok(html.includes('작은 입력 조건부터 확인해 볼래요.'))
  assert.equal(html.includes('<textarea'), false)
  c.open('feedback'); c.change('검증 조건이 부족했어요.'); c.submit()
  assert.ok(renderNotes(c.getState()).includes('의견이 전송되었어요.'))
  assert.equal(renderNotes(c.getState(), false).includes('의견 남기기'), false)
})

test('viewing hint 1 after hint 2 never lowers revealed level, discards hint 2, or exposes unopened content', () => {
  const state = { chatId: 'chat', level: 2, stuckPoint: 'FLOW', stillDifficult: true, hints: [{ level: 1, text: '첫 단서' }, { level: 2, text: '두 번째 단서' }] }
  const original = structuredClone(state)
  assert.equal(displayedHint(state, 1).text, '첫 단서')
  assert.equal(displayedHint(state, 2).text, '두 번째 단서')
  assert.deepEqual(state, original)
  assert.equal(displayedHint({ ...state, level: 1, hints: state.hints.slice(0, 1) }, 2).level, 1)
  assert.equal(displayedHint(null, 2), undefined)
  assert.equal(readViewedHint('2'), null)
  assert.equal(readViewedHint(1), 1)
  const hints = { state, currentHint: displayedHint(state, 1), busy: false, uncertain: false, transitionBlocked: false }
  let html = renderToStaticMarkup(createElement(HintPanel, { hints }))
  assert.ok(html.includes('힌트를 더 볼까요?'))
  assert.equal(html.includes('두 번째 단서'), false)
  html = renderToStaticMarkup(createElement(HintPanel, { hints: { ...hints, currentHint: displayedHint(state, 2) } }))
  assert.ok(html.includes('이전 힌트 보기'))
  assert.ok(html.includes('두 번째 단서'))
  assert.ok(html.includes('그래도 잘 모르겠다면 기초 학습으로 이어서 설명해 드릴게요.'))
})

test('MSW hint reveal and basic-learning prerequisites remain server-owned after local backward navigation and server reload', async () => {
  const origin = 'http://localhost:9890', db = new Map()
  const persistence = { read: key => JSON.parse(db.get(key) ?? 'null'), write: (key, value) => db.set(key, JSON.stringify(value)) }
  const options = { origin, delayMs: 1, persistence }
  const server = setupServer(...createChatHandlers(options))
  server.listen({ onUnhandledFrame: 'error' })
  const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const chat = await (await post('/api/chats', { question: '어떤 순서로 확인할까요?', code: '', type: 'DEBUGGING', clientRequestId: 'hint-navigation' })).json()
    const path = '/api/chats/' + chat.id
    await post(path + '/hints', { level: 1 })
    assert.equal((await post(path + '/basic-learning', { clientRequestId: 'too-early' })).status, 409)
    await post(path + '/hints', { level: 2 })
    server.resetHandlers(...createChatHandlers(options))
    const state = await (await fetch(origin + path + '/hints')).json()
    assert.equal(displayedHint(state, readViewedHint(1)).level, 1)
    assert.equal(state.level, 2)
    assert.equal(state.hints.length, 2)
    assert.equal(state.stuckPoint, null)
    assert.equal('stillDifficult' in state, false)
    assert.equal((await fetch(origin + path + '/analysis')).status, 403)
    assert.equal((await post(path + '/basic-learning', { clientRequestId: 'eligible' })).status, 202)
  } finally { server.close() }
})


test('BASIC loading keeps its composer disabled with F-19 stop control and no extra learning badge', () => {
  const chat = { id: 'basic-chat', status: 'LOCKED', question: '값은 언제 준비될까요?', code: '', type: 'DEBUGGING' }
  const transition = { chatId: chat.id, transitionId: 'transition', learningPath: 'BASIC', status: 'AWAITING_CONTENT', excludeFromGrowth: true }
  const html = renderToStaticMarkup(createElement(BasicLearningResult, { chat, transition, draft: '보존할 초안' }))
  const textarea = html.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/u)?.[0] ?? ''
  assert.ok(textarea.includes('생각을 30자 이상 남기면 AI 답변을 열어 볼 수 있어요.'))
  assert.match(textarea, /\sdisabled=""/u)
  assert.equal(html.includes('type="submit"'), false)
  assert.equal((html.match(/<button\b[^>]*\sdisabled=""/gu) ?? []).length, 2)
  assert.match(html, /aria-label="분석 중지"/u)
  assert.doesNotMatch(html, /<button\b[^>]*aria-label="분석 중지"[^>]*\sdisabled=""/u)
  assert.doesNotMatch(html, /도움받아 학습|시연용|이 탭에만 저장/u)
  assert.ok(html.includes('보존할 초안'))
})

test('hint 2 makes the existing sentence/arrow one BASIC button without a checkbox or return button', () => {
  const state = { chatId: 'chat', level: 2, stuckPoint: null, hints: [{ level: 1, text: '첫 단서' }, { level: 2, text: '두 번째 단서' }] }
  for (const change of [{}, { stuckPoint: 'FLOW' }, { stillDifficult: false }, { level: 1 }]) {
    const next = { ...state, ...change }
    const html = renderToStaticMarkup(createElement(HintPanel, { hints: { state: next, currentHint: next.hints[1], busy: false, uncertain: false } }))
    assert.equal(html.includes('type="checkbox"'), false)
    assert.equal(html.includes('다시 생각해 봤지만 아직 어려워요'), false)
    assert.equal(html.includes('내 생각 적어 볼게요'), false)
    const action = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gu) ?? []).find(button => button.includes('그래도 잘 모르겠다면 기초 학습으로 이어서 설명해 드릴게요.')) ?? ''
    assert.ok(action.includes('<img'))
    assert.equal(/\sdisabled(?:=|\s|>)/u.test(action), next.level !== 2)
    assert.equal(html.includes('힌트에는 선택사항'), false)
  }
  const first = renderToStaticMarkup(createElement(HintPanel, { hints: { state: { ...state, level: 1, hints: state.hints.slice(0, 1) }, currentHint: state.hints[0] } }))
  assert.equal(first.includes('그래도 잘 모르겠다면'), false)
  for (const flags of [{ busy: true }, { uncertain: true }]) {
    const html = renderToStaticMarkup(createElement(HintPanel, { hints: { state, currentHint: state.hints[1], ...flags } }))
    const action = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gu) ?? []).find(button => button.includes('그래도 잘 모르겠다면')) ?? ''
    assert.match(action, /\sdisabled(?:=|\s|>)/u)
  }
})
