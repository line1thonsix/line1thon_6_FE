import type { HistoryItem } from '../../types/history'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'

type SidebarProps = { onCollapse: () => void; onNewChat: () => void; onNotice: (message: string) => void; currentQuestion?: string; recent?: HistoryItem[]; historyActive?: boolean; currentChatId?: string; historyError?: string; onHistory?: () => void; onOpenChat?: (id: string) => void; onHistoryRetry?: () => void }
export function Sidebar({ onCollapse, onNewChat, onNotice, currentQuestion, recent = [], historyActive, currentChatId, historyError, onHistory, onOpenChat, onHistoryRetry }: SidebarProps) {
  const items: { label: string; icon: IconName; onClick: () => void }[] = [
    { label: '새 채팅', icon: 'newChat', onClick: onNewChat },
    { label: '학습 기록', icon: 'history', onClick: () => onHistory?.() },
    { label: '이용 안내', icon: 'info', onClick: () => onNotice('질문을 남기고, 내 생각을 적은 뒤 AI의 참고 관점과 비교하는 서비스예요.') },
  ]
  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col gap-5 bg-sidebar p-shell" aria-label="사이드바">
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-[22px] leading-7 font-light">De<span className="text-logo-accent">v</span>eil</span>
        <Button className="ml-auto size-9 rounded-lg" aria-label="사이드바 접기" onClick={onCollapse}><Icon name="sidebar" /></Button>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="주 메뉴">
        {items.map(item => <Button variant="plain" key={item.label} aria-current={historyActive && item.label === '학습 기록' ? 'page' : undefined} className={`justify-start gap-2.5 rounded-lg px-2.5 py-[9px] text-body text-secondary ${historyActive && item.label === '학습 기록' ? 'bg-brand-soft' : 'hover:bg-brand-subtle'}`} onClick={item.onClick}><Icon name={item.icon} />{item.label}</Button>)}
      </nav>
      <section aria-label="최근 대화" className="min-h-0 flex-1 overflow-y-auto"><p className="sticky top-0 bg-sidebar px-2.5 py-1.5 text-caption text-muted">최근 대화</p>
        {recent.slice(0, 10).map(item => <Button variant="plain" key={item.id} aria-current={!historyActive && currentChatId === item.id ? 'page' : undefined} onClick={() => onOpenChat?.(item.id)} className={`mt-0.5 w-full justify-start rounded-lg px-2.5 py-2 text-left text-body break-words ${!historyActive && currentChatId === item.id ? 'bg-brand-soft text-ink' : 'text-secondary hover:bg-brand-subtle'}`}><span className="line-clamp-2">{item.question}</span></Button>)}
        {!recent.length && currentQuestion && !historyActive && <p aria-current="page" className="mt-0.5 rounded-lg bg-brand-soft px-2.5 py-2 text-body break-words">{currentQuestion.slice(0, 80)}</p>}
        {historyError && <div role="alert" className="px-2.5 py-2 text-caption text-secondary"><p>{historyError}</p><Button className="mt-1 text-brand underline" onClick={onHistoryRetry}>다시 불러오기</Button></div>}
      </section>
      <div className="mt-auto border-t border-line pt-3">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-caption font-medium text-brand-deep">게</span>
          <div className="min-w-0 flex-1"><p className="text-body font-medium">게스트</p><p className="mt-0.5 whitespace-nowrap text-micro text-muted">이 브라우저에 자동 저장돼요</p></div>
          <Button aria-label="게스트 메뉴" onClick={() => onNotice('게스트 데이터 관리는 다음 단계에서 제공할 예정이에요.')}><Icon name="more" /></Button>
        </div>
      </div>
    </aside>
  )
}
