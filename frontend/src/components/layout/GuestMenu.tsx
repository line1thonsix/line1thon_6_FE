import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

export function GuestMenu({ onDelete, conversation = false }: { onDelete?: () => void; conversation?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    menu.current?.focus()
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
      else if (event.key === 'Tab') setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('popstate', close)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('popstate', close) }
  }, [open])
  return <div ref={root} className={conversation ? 'absolute top-[11px] right-3 z-10' : 'contents'}>
    <Button ref={trigger} id={id} variant="plain" aria-label={conversation ? '대화 더보기' : '게스트 메뉴'} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} onClick={() => setOpen(value => !value)}><Icon name={conversation ? 'historyMore' : 'more'} /></Button>
    {open && <div ref={menu} id={`${id}-menu`} tabIndex={-1} role="menu" aria-labelledby={id} className={`absolute ${conversation ? 'right-0 top-[26px]' : 'left-1 bottom-[calc(100%+8px)]'} z-40 w-max rounded-panel border border-line bg-page p-1.5 shadow-guest-menu focus:outline-none`}>
      <Button role="menuitem" disabled={!onDelete} onClick={() => { trigger.current?.focus(); setOpen(false); onDelete?.() }} variant="plain" className="gap-2 rounded-[9px] bg-guest-delete-bg py-[9px] pr-4 pl-3 text-body leading-[17px] text-guest-delete-fg"><Icon name="guestDelete" />{conversation ? '이 대화 삭제' : '전체 데이터 삭제'}</Button>
    </div>}
  </div>
}
