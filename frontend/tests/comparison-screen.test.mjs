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
  assert.equal(html.includes('직접 생각 작성'), false)
  assert.equal(html.includes('도움받아 학습'), false)
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

test('stored-example tag and one sparse result render alongside four empty categories', () => {
  const result = readComparisonResult(buildComparisonFixture(chat, thought, 'job', 'result', 'sparse'), thought)
  const html = renderToStaticMarkup(createElement(ComparisonContent, { result: { ...result, responseSource: 'SAVED_EXAMPLE' } }))
  assert.ok(html.includes('저장 예시'))
  assert.equal(html.includes('직접 생각 작성'), false)
  assert.equal((html.match(/<article\b/gu) ?? []).length, 5)
  assert.equal(html.includes('비교 항목 필터'), false)
})

const cards = result => [...renderToStaticMarkup(createElement(ComparisonContent, { result })).matchAll(/<article\b[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gu)]

test('comparison fixes category order, keeps per-category wire order and leaves findings intact', () => {
  const result = readComparisonResult(buildComparisonFixture(chat, thought, 'job', 'result', 'all-categories'), thought)
  const common = result.findings.find(f => f.category === 'COMMON')
  const conflict = result.findings.find(f => f.category === 'CONFLICT')
  const complement = result.findings.find(f => f.category === 'COMPLEMENT')
  const second = { ...conflict, id: 'second-conflict', title: '두 번째 오류' }
  const findings = Object.freeze([complement, conflict, common, second])
  const rendered = cards({ ...result, findings })
  assert.deepEqual(rendered.map(([, label]) => label), [
    `공통: ${common.title}`, `오류: ${conflict.title}`, '오류: 두 번째 오류', `보완: ${complement.title}`, '고유', '판단 보류',
  ])
  const evidenceIds = rendered.slice(0, 4).map(([, , body]) => {
    assert.match(body, /<h3 class="text-body font-medium">/u)
    assert.match(body, /근거와 확인 방법 보기/u)
    return body.match(/aria-controls="([^"]+)"/u)?.[1]
  })
  assert.ok(evidenceIds.every(Boolean))
  assert.equal(new Set(evidenceIds).size, 4)
  assert.deepEqual(findings, [complement, conflict, common, second])
  assert.deepEqual(cards({ ...result, findings: [complement, common] }).map(([, label]) => label),
    [`공통: ${common.title}`, '오류', `보완: ${complement.title}`, '고유', '판단 보류'])
})

test('a completed empty result renders five badge-only headers and exact copy in existing body styles', () => {
  const result = readComparisonResult(buildComparisonFixture(chat, thought, 'job', 'result', 'empty'), thought)
  const rendered = cards(result)
  const expected = [
    ['공통', '이번 분석에서 공통으로 분류된 내용이 없어요.', 'bg-me-surface'],
    ['오류', '이번 분석에서 별도로 지적된 오류는 없어요.', 'bg-me-surface'],
    ['보완', '이번 분석에서 별도로 제안된 보완점은 없어요.', 'bg-ai-surface'],
    ['고유', '이번 분석에서 고유한 관점으로 분류된 내용은 없어요.', 'bg-me-surface'],
    ['판단 보류', '이번 분석에서 판단을 보류한 항목은 없어요.', 'bg-hold-surface'],
  ]
  assert.deepEqual(rendered.map(([, label]) => label), expected.map(([label]) => label))
  for (const [index, [, label, body]] of rendered.entries()) {
    const [, message, surface] = expected[index]
    assert.ok(body.includes(`<span class="finding-badge">${label}</span></div>`))
    assert.ok(body.includes(surface))
    assert.ok(body.includes(`<p class="text-caption font-medium leading-4 text-muted">${message}</p>`))
    assert.doesNotMatch(body, /<h[1-6]\b|<button\b|내 생각/u)
  }
})
