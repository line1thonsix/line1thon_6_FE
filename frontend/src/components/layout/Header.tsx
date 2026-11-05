import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

type HeaderProps = { title: string; collapsed: boolean; onExpand: () => void }
export function Header({ title, collapsed, onExpand }: HeaderProps) {
  return <header className="flex h-header shrink-0 items-center gap-4 border-b border-line px-header-inset">
    {collapsed && <Button aria-label="사이드바 펼치기" className="size-9" onClick={onExpand}><Icon name="sidebar" /></Button>}
    <h1 className="text-body-lg font-medium leading-6">{title}</h1>
  </header>
}
