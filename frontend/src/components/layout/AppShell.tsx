import type { ReactNode } from 'react'
import type { HistoryItem } from '../../types/history'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Button } from '../ui/Button'

type AppShellProps = { title: string; children: ReactNode; onNewChat: () => void; currentQuestion?: string; recent?: HistoryItem[]; historyActive?: boolean; currentChatId?: string; historyError?: string; onHistory?: () => void; onOpenChat?: (id: string) => void; onHistoryRetry?: () => void }
export function AppShell({ title, children, onNewChat, currentQuestion, recent, historyActive, currentChatId, historyError, onHistory, onOpenChat, onHistoryRetry }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [notice, setNotice] = useState('')
  return <div className="flex h-dvh min-h-[640px] bg-page">
    {!collapsed && <Sidebar recent={recent} historyActive={historyActive} currentChatId={currentChatId} historyError={historyError} onHistory={onHistory} onOpenChat={onOpenChat} onHistoryRetry={onHistoryRetry} currentQuestion={currentQuestion} onCollapse={() => setCollapsed(true)} onNewChat={() => { setNotice(''); onNewChat() }} onNotice={setNotice} />}
    <div className="flex min-w-0 flex-1 flex-col"><Header title={title} collapsed={collapsed} onExpand={() => setCollapsed(false)} />{children}</div>
    {notice && <div role="status" className="fixed right-6 bottom-6 flex max-w-sm items-center gap-4 rounded-panel border border-line bg-page p-4 shadow-md"><p>{notice}</p><Button className="shrink-0 px-2 py-1" onClick={() => setNotice('')}>닫기</Button></div>}
  </div>
}
