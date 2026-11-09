import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { questionTypeOptions, questionTypeLabel, defaultQuestionType, newQuestionType } from '../src/data/questionTypes.ts'
import { helpTabs, restoredHelpTab } from '../src/data/helpTabs.ts'

let server
let FindingCard, LockedAnswer, QuestionTypeSelect
before(async () => {
  server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ FindingCard } = await server.ssrLoadModule('/src/components/chat/FindingCard.tsx'))
  ;({ LockedAnswer } = await server.ssrLoadModule('/src/components/chat/LockedAnswer.tsx'))
  ;({ QuestionTypeSelect } = await server.ssrLoadModule('/src/components/chat/QuestionTypeSelect.tsx'))
})
after(async () => { await server?.close() })
const plain = html => html.replace(/<[^>]*>/gu, '')
const base = { id: 'finding', title: '비교 근거', reason: '분류 이유', verification: '확인 방법' }
const render = finding => renderToStaticMarkup(createElement(FindingCard, { finding: { ...base, ...finding } }))

test('new questions expose exactly four explicit types with DEBUGGING default and a legacy-safe label', () => {
  assert.deepEqual(questionTypeOptions.map(item => item.value), ['CONCEPT', 'DEBUGGING', 'PROBLEM_SOLVING', 'DESIGN'])
  assert.equal(defaultQuestionType, 'DEBUGGING')
  assert.equal(newQuestionType('FREE'), 'DEBUGGING')
  for (const { value } of questionTypeOptions) assert.equal(newQuestionType(value), value)
  const html = renderToStaticMarkup(createElement(QuestionTypeSelect, { value: 'FREE', onChange() {} }))
  assert.equal(plain(html).includes('자유롭게'), false)
  assert.equal(questionTypeLabel('FREE'), '미분류')
})

test('locked help has only choices/hints; saved example tab recovers to choices with the original three choice buttons', () => {
  assert.deepEqual(helpTabs.map(item => item.id), ['choices', 'hints'])
  assert.equal(restoredHelpTab('example'), 'choices')
  assert.equal(restoredHelpTab('hints'), 'hints')
  assert.equal(restoredHelpTab(null), 'choices')
  const choices = ['입력 조건', '실행 순서', '검증 방법']
  const html = renderToStaticMarkup(createElement(LockedAnswer, {
    chat: { id: 'chat', status: 'LOCKED', question: '질문', code: '', type: 'DEBUGGING', choices, exampleSentence: '삭제된 예시 문장' },
    selectedChoice: 1, onChoice() {}, hints: { tab: restoredHelpTab('example'), select() {} },
  }))
  const text = plain(html)
  assert.equal(text.includes('예시 문장'), false)
  assert.equal((html.match(/role="tab"/gu) ?? []).length, 2)
  assert.ok(text.includes('살펴볼 지점'))
  assert.ok(text.includes('힌트'))
  for (const choice of choices) assert.ok(text.includes(choice))
  assert.equal((html.match(/aria-pressed="true"/gu) ?? []).length, 1)
})

test('COMPLEMENT renders only the AI evidence row, even with an optional user quote', () => {
  const html = render({ category: 'COMPLEMENT', aiPerspective: '추가로 확인할 AI 관점', userQuote: '요약에서 제외할 내 인용', conditions: '적용 조건' })
  const text = plain(html)
  assert.ok(html.includes('aria-label="AI 근거"'))
  assert.ok(text.includes('추가로 확인할 AI 관점'))
  assert.equal(text.includes('요약에서 제외할 내 인용'), false)
  assert.equal(text.includes('내 생각에는 없던 부분이에요'), false)
  assert.equal(html.includes('grid-cols-2'), false)
  assert.ok(html.includes('aria-expanded="false"'))
})

test('UNIQUE renders only the user evidence row; no missing-AI placeholder is emitted', () => {
  const html = render({ category: 'UNIQUE', userQuote: '내가 직접 제안한 확인 방법' })
  const text = plain(html)
  assert.ok(html.includes('aria-label="내 생각 근거"'))
  assert.ok(text.includes('내가 직접 제안한 확인 방법'))
  assert.equal(text.includes('AI'), false)
  assert.equal(html.includes('grid-cols-2'), false)
  assert.ok(html.includes('aria-expanded="false"'))
})

test('COMMON/CONFLICT retain both perspectives and UNDETERMINED retains its question', () => {
  for (const category of ['COMMON', 'CONFLICT']) {
    const html = render({ category, userQuote: '원문 생각', aiPerspective: '대응 AI 관점', conflictEvidence: '충돌 근거' })
    assert.ok(html.includes('grid-cols-2'))
    assert.ok(plain(html).includes('원문 생각'))
    assert.ok(plain(html).includes('대응 AI 관점'))
  }
  const html = render({ category: 'UNDETERMINED', question: '어떤 조건인지 확인할까요?' })
  assert.ok(plain(html).includes('어떤 조건인지 확인할까요?'))
  assert.equal(html.includes('grid-cols-2'), false)
})
