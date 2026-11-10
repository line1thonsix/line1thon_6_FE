import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { Ref } from 'react'

type HeaderProps = { title: string; collapsed: boolean; onExpand: () => void; expandRef?: Ref<HTMLButtonElement> }
export function Header({ title, collapsed, onExpand, expandRef }: HeaderProps) {
  return <header className="flex h-header shrink-0 items-center gap-4 border-b border-line px-header-inset">
    <Button ref={expandRef} aria-label="사이드바 펼치기" className={`size-9 shrink-0 ${collapsed ? '' : 'md:hidden'}`} onClick={onExpand}><Icon name="sidebar" /></Button>
    <h1 className="truncate text-body-lg font-medium leading-6">{title}</h1>
  </header>
}
