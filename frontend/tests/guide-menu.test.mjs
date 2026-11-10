import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { workspaceView, workspaceViewParams } from '../src/data/workspaceView.ts'

let vite, UsageGuide, Sidebar, GuestMenu, AppShell
before(async () => {
  vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ UsageGuide } = await vite.ssrLoadModule('/src/pages/UsageGuide.tsx'))
  ;({ Sidebar } = await vite.ssrLoadModule('/src/components/layout/Sidebar.tsx'))
  ;({ GuestMenu } = await vite.ssrLoadModule('/src/components/layout/GuestMenu.tsx'))
  ;({ AppShell } = await vite.ssrLoadModule('/src/components/layout/AppShell.tsx'))
})
after(async () => { await vite?.close() })
const render = (component, props = {}) => renderToStaticMarkup(createElement(component, props))

test('guide routing survives URL reconstruction and preserves Mock options without mutating history parameters', () => {
  const original = new URLSearchParams('view=history&analysis=slow&demo=true')
  const guide = workspaceViewParams(original, 'guide')
  assert.equal(workspaceView(new URLSearchParams(guide.toString())), 'guide')
  assert.equal(original.get('view'), 'history')
  assert.equal(guide.get('analysis'), 'slow')
  assert.equal(guide.get('demo'), 'true')
  assert.equal(workspaceView(workspaceViewParams(guide, 'history')), 'history')
  const chat = workspaceViewParams(guide, 'chat')
  assert.equal(chat.has('view'), false)
  assert.equal(workspaceView(chat), 'chat')
  assert.equal(workspaceView(new URLSearchParams('view=unknown')), 'chat')
})

test('guide contains four Figma steps and three safety notes as illustrations, not live chat inputs or result payloads', () => {
  const html = render(UsageGuide)
  for (const copy of ['질문을 보내요', '접근을 고르거나 내 생각을 써요', '막히면 힌트를 봐요', '내 생각과 AI를 비교해요', '코드를 붙여 넣을 때는 개인정보와 키를 지워 주세요.', '게스트로 쓰는 동안 기록은 이 브라우저에 자동 저장돼요.', '중요한 내용은 직접 확인해 주세요.']) assert.ok(html.includes(copy), copy)
  assert.equal((html.match(/<h3/g) ?? []).length, 5)
  assert.equal(/<(button|input|textarea|form|a)\b/.test(html), false)
  assert.equal(/referenceAnswer|resultId|chatId/.test(html), false)
  assert.ok(html.includes('grid-cols-1'))
  assert.ok(html.includes('md:grid-cols-2'))
})

test('guide navigation has a single current page and does not mark the retained conversation selected', () => {
  const html = render(Sidebar, { guideActive: true, currentChatId: 'saved-chat', recent: [{ id: 'saved-chat', question: '복구할 질문', learningPath: null, progress: 'LOCKED', createdAt: 1, updatedAt: 1, reflection: null }], onCollapse() {}, onNewChat() {} })
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
  assert.match(html, /aria-current="page"[^>]*>.*?이용 안내/s)
  assert.ok(html.includes('복구할 질문'))
  assert.equal(html.includes('다음 단계에서 제공'), false)
})

test('guest menu starts closed and mobile shell offers the existing navigation without placeholder notices', () => {
  const html = render(GuestMenu)
  assert.ok(html.includes('aria-haspopup="menu"'))
  assert.ok(html.includes('aria-expanded="false"'))
  assert.equal(html.includes('role="menuitem"'), false)
  const shell = render(AppShell, { title: '이용 안내', guideActive: true, onNewChat() {}, children: createElement(UsageGuide) })
  assert.ok(shell.includes('사이드바 펼치기'))
  assert.ok(shell.includes('학습 기록'))
  assert.equal(shell.includes('role="dialog"'), false)
  assert.equal(shell.includes('준비 중'), false)
})
