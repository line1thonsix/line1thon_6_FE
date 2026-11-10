import type { ReactNode } from 'react'
import type { HistoryItem } from '../../types/history'
import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

type AppShellProps = { onDeleteAll?: () => void; title: string; children: ReactNode; onNewChat: () => void; currentQuestion?: string; recent?: HistoryItem[]; historyActive?: boolean; guideActive?: boolean; onGuide?: () => void; currentChatId?: string; historyError?: string; onHistory?: () => void; onOpenChat?: (id: string) => void; onHistoryRetry?: () => void }
export function AppShell({ onDeleteAll, title, children, onNewChat, currentQuestion, recent, historyActive, guideActive, onGuide, currentChatId, historyError, onHistory, onOpenChat, onHistoryRetry }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const drawer = useRef<HTMLDivElement>(null)
  const expand = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!mobileOpen) return
    const opener = expand.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const close = () => setMobileOpen(false)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof Element && event.target.closest('[role="menu"]'))) { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const items = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(item => item.getClientRects().length)
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    const media = matchMedia('(min-width: 768px)')
    const resized = () => { if (media.matches) close() }
    document.addEventListener('keydown', key)
    window.addEventListener('popstate', close)
    media.addEventListener('change', resized)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); window.removeEventListener('popstate', close); media.removeEventListener('change', resized); opener?.focus() }
  }, [mobileOpen])
  function navigate(action?: () => void) { setMobileOpen(false); action?.() }
  const sidebar = {
    onDeleteAll: onDeleteAll ? () => navigate(onDeleteAll) : undefined,
    recent, historyActive, guideActive, currentChatId, historyError, currentQuestion, onHistoryRetry,
    onGuide: () => navigate(onGuide), onHistory: () => navigate(onHistory), onNewChat: () => navigate(onNewChat),
    onOpenChat: (id: string) => { setMobileOpen(false); onOpenChat?.(id) },
  }
  return <div className="flex h-dvh min-h-0 bg-page md:min-h-[640px]">
    {!collapsed && <div className="hidden h-full md:block"><Sidebar {...sidebar} onCollapse={() => setCollapsed(true)} /></div>}
    {mobileOpen && <div className="fixed inset-0 z-30 md:hidden">
      <button type="button" aria-label="사이드바 닫기" tabIndex={-1} className="absolute inset-y-0 right-0 left-sidebar bg-black/25" onClick={() => setMobileOpen(false)} />
      <div ref={drawer} role="dialog" aria-modal="true" aria-label="탐색 메뉴" className="relative h-full w-sidebar"><Sidebar {...sidebar} onCollapse={() => setMobileOpen(false)} /></div>
    </div>}
    <div inert={mobileOpen} className="flex min-w-0 flex-1 flex-col"><Header title={title} collapsed={collapsed} expandRef={expand} onExpand={() => { if (matchMedia('(max-width: 767px)').matches) setMobileOpen(true); else setCollapsed(false) }} />{children}</div>
  </div>
}
