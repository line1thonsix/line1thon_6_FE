import type { HistoryItem } from '../../types/history'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { GuestMenu } from './GuestMenu'

type SidebarProps = { onDeleteAll?: () => void; onCollapse: () => void; onNewChat: () => void; onNotice?: (message: string) => void; onGuide?: () => void; guideActive?: boolean; currentQuestion?: string; recent?: HistoryItem[]; historyActive?: boolean; currentChatId?: string; historyError?: string; onHistory?: () => void; onOpenChat?: (id: string) => void; onHistoryRetry?: () => void }
export function Sidebar({ onDeleteAll, onCollapse, onNewChat, onGuide, guideActive, currentQuestion, recent = [], historyActive, currentChatId, historyError, onHistory, onOpenChat, onHistoryRetry }: SidebarProps) {
  const items: { label: string; icon: IconName; onClick: () => void }[] = [
    { label: '새 채팅', icon: 'newChat', onClick: onNewChat },
    { label: '학습 기록', icon: 'history', onClick: () => onHistory?.() },
    { label: '이용 안내', icon: 'info', onClick: () => onGuide?.() },
  ]
  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col gap-5 bg-sidebar p-shell" aria-label="사이드바">
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-[22px] leading-7 font-light">De<span className="text-logo-accent">v</span>eil</span>
        <Button className="ml-auto size-9 rounded-lg" aria-label="사이드바 접기" onClick={onCollapse}><Icon name="sidebar" /></Button>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="주 메뉴">
        {items.map(item => { const active = historyActive && item.label === '학습 기록' || guideActive && item.label === '이용 안내'; return <Button variant="plain" key={item.label} aria-current={active ? 'page' : undefined} className={`justify-start gap-2.5 rounded-lg px-2.5 py-[9px] text-body text-secondary ${active ? 'bg-brand-soft' : 'hover:bg-brand-subtle'}`} onClick={item.onClick}><Icon name={item.icon} />{item.label}</Button> })}
      </nav>
      <section aria-label="최근 대화" className="min-h-0 flex-1 overflow-y-auto"><p className="sticky top-0 bg-sidebar px-2.5 py-1.5 text-caption text-muted">최근 대화</p>
        {recent.slice(0, 10).map(item => <Button variant="plain" key={item.id} aria-current={!historyActive && !guideActive && currentChatId === item.id ? 'page' : undefined} onClick={() => onOpenChat?.(item.id)} className={`mt-0.5 w-full justify-start rounded-lg px-2.5 py-2 text-left text-body break-words ${!historyActive && !guideActive && currentChatId === item.id ? 'bg-brand-soft text-ink' : 'text-secondary hover:bg-brand-subtle'}`}><span className="line-clamp-2">{item.question}</span></Button>)}
        {!recent.length && currentQuestion && !historyActive && !guideActive && <p aria-current="page" className="mt-0.5 rounded-lg bg-brand-soft px-2.5 py-2 text-body break-words">{currentQuestion.slice(0, 80)}</p>}
        {historyError && <div role="alert" className="px-2.5 py-2 text-caption text-secondary"><p>{historyError}</p><Button className="mt-1 text-brand underline" onClick={onHistoryRetry}>다시 불러오기</Button></div>}
      </section>
      <div className="relative mt-auto border-t border-line pt-3">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-caption font-medium text-brand-deep">게</span>
          <div className="min-w-0 flex-1"><p className="text-body font-medium">게스트</p><p className="mt-0.5 whitespace-nowrap text-micro text-muted">이 브라우저에 자동 저장돼요</p></div>
          <GuestMenu onDelete={onDeleteAll} />
        </div>
      </div>
    </aside>
  )
}
