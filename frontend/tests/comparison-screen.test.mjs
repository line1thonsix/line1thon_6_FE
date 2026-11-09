import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildComparisonFixture } from '../src/mocks/comparisonFixtures.ts'
import { readComparisonResult } from '../src/api/comparisonResult.ts'

let server, ComparisonContent, QuestionComposer
before(async () => {
  server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ ComparisonContent } = await server.ssrLoadModule('/src/components/chat/ComparisonResult.tsx'))
  ;({ QuestionComposer } = await server.ssrLoadModule('/src/components/chat/QuestionComposer.tsx'))
})
after(async () => { await server?.close() })
const thought = '첫 렌더링 때 users 값부터 볼게요. 이유는 데이터가 오기 전에는 users가 비어 있을 것 같아서예요. console.log로 값을 찍어 확인하고, 빈 배열일 때도 따로 해 볼래요.'
const chat = { id: 'chat', status: 'LOCKED', question: 'users가 undefined인 이유를 확인할까요?', code: '', type: 'DEBUGGING' }
const props = { draft: chat, mode: 'locked', validation: '', onChange() {}, onSubmit() {}, thought, onThoughtChange() {}, thoughtPhase: 'pending' }
const renderComposer = extra => renderToStaticMarkup(createElement(QuestionComposer, { ...props, ...extra }))

test('comparison shows every result card without category filters; expansion controls and single-source rows remain', () => {
  const result = readComparisonResult(buildComparisonFixture(chat, thought, 'job', 'result', 'all-categories'), thought)
  const html = renderToStaticMarkup(createElement(ComparisonContent, { result }))
  assert.equal(result.findings.length, 5)
  assert.equal((html.match(/<article\b/gu) ?? []).length, 5)
  assert.equal((html.match(/aria-expanded="false"/gu) ?? []).length, 5)
  assert.equal(html.includes('비교 항목 필터'), false)
  assert.doesNotMatch(html, /aria-label="(?:전체|공통|보완|고유|오류|판단 보류) 필터"/u)
  assert.ok(html.includes('두 관점 비교'))
  assert.ok(html.includes('aria-label="AI 근거"'))
  assert.ok(html.includes('aria-label="내 생각 근거"'))
  assert.equal(html.includes('내 생각에는 없던 부분이에요'), false)
  assert.equal(html.includes('AI 참고 관점에는 없던 부분이에요'), false)
  assert.equal(html.includes('바로 한 줄 남기기'), false)
  assert.ok(html.includes('배운 점 한 줄 남기기'))
  assert.ok(html.includes('의견 남기기'))
})

test('completed composer remains visible with only the Figma notice; composing/submitting controls are inactive', () => {
  const html = renderComposer({ mode: 'completed' })
  const textarea = html.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/u)?.[0] ?? ''
  assert.ok(textarea.includes('다른 주제의 질문은 새 채팅에서 던져 보세요.'))
  assert.ok(textarea.includes('aria-label="대화 완료 안내"'))
  assert.match(textarea, /readonly/iu)
  assert.equal(textarea.includes(thought), false)
  assert.equal((html.match(/<button\b[^>]*disabled/gu) ?? []).length, 3)
  assert.equal(html.includes('type="submit"'), false)
  assert.equal(html.includes('생각 글자 수'), false)
})

test('writing/pending composer retains existing validation and waiting behavior without prematurely showing completion', () => {
  const pending = renderComposer({ mode: 'locked', thoughtPhase: 'pending' })
  assert.equal(pending.includes('다른 주제의 질문은 새 채팅에서 던져 보세요.'), false)
  assert.ok(pending.includes('aria-label="내 생각"'))
  assert.ok(pending.includes('분석 대기 중'))
  const writing = renderComposer({ thoughtPhase: 'writing', thoughtManual: '짧은 직접 작성', thoughtFeedback: '30자 이상 적어 주세요.' })
  assert.equal(writing.includes('readOnly='), false)
  assert.ok(writing.includes('aria-invalid="true"'))
  assert.ok(writing.includes('30자 이상 적어 주세요.'))
  assert.match(writing, /<button\b[^>]*aria-label="내 생각 제출"[^>]*disabled/u)
})

test('stored-example tag and sparse result cards survive removing the filter UI', () => {
  const result = readComparisonResult(buildComparisonFixture(chat, thought, 'job', 'result', 'sparse'), thought)
  const html = renderToStaticMarkup(createElement(ComparisonContent, { result: { ...result, responseSource: 'SAVED_EXAMPLE' } }))
  assert.ok(html.includes('저장 예시'))
  assert.equal((html.match(/<article\b/gu) ?? []).length, result.findings.length)
  assert.equal(html.includes('비교 항목 필터'), false)
})
