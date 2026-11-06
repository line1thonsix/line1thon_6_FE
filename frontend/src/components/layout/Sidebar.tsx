import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'

type SidebarProps = { onCollapse: () => void; onNewChat: () => void; onNotice: (message: string) => void; currentQuestion?: string }
export function Sidebar({ onCollapse, onNewChat, onNotice, currentQuestion }: SidebarProps) {
  const items: { label: string; icon: IconName; onClick: () => void }[] = [
    { label: '새 채팅', icon: 'newChat', onClick: onNewChat },
    { label: '학습 기록', icon: 'history', onClick: () => onNotice('학습 기록은 다음 단계에서 제공할 예정이에요.') },
    { label: '이용 안내', icon: 'info', onClick: () => onNotice('질문을 남기고, 내 생각을 적은 뒤 AI의 참고 관점과 비교하는 서비스예요.') },
  ]
  return (
    <aside className="flex h-full w-sidebar shrink-0 flex-col gap-5 bg-sidebar p-shell" aria-label="사이드바">
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-[22px] leading-7 font-light">De<span className="text-logo-accent">v</span>eil</span>
        <Button className="ml-auto size-9 rounded-lg" aria-label="사이드바 접기" onClick={onCollapse}><Icon name="sidebar" /></Button>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="주 메뉴">
        {items.map(item => <Button key={item.label} className="justify-start gap-2.5 rounded-lg px-2.5 py-[9px] text-body" onClick={item.onClick}><Icon name={item.icon} />{item.label}</Button>)}
      </nav>
      <section aria-label="최근 대화"><p className="px-2.5 py-1.5 text-caption text-muted">최근 대화</p>{currentQuestion && <p aria-current="page" className="mt-0.5 rounded-lg bg-brand-soft px-2.5 py-2 text-body break-words">{currentQuestion.slice(0, 80)}</p>}</section>
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
