import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { questionTypeLabel, questionTypeOptions } from '../../data/questionTypes'
import type { QuestionType } from '../../types/chat'

type Props = { value: QuestionType; disabled?: boolean; onChange: (value: QuestionType) => void }
export function QuestionTypeSelect({ value, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={root} className="relative">
    <Button ref={trigger} disabled={disabled} variant="soft" aria-expanded={open} aria-controls="question-type-options" className="gap-[5px] py-[5px] pr-1.5 pl-2 text-caption disabled:bg-sidebar disabled:text-muted" onClick={() => setOpen(v => !v)}>
      <span>질문 유형</span><span className="font-medium">{questionTypeLabel(value)}</span><Icon name={disabled ? 'chevronDisabled' : open ? 'chevronUp' : 'chevron'} />
    </Button>
    {open && !disabled && <div id="question-type-options" aria-label="질문 유형 선택" className="absolute bottom-full left-0 z-20 mb-2 w-type-menu rounded-panel border border-line bg-page p-1.5 shadow-popover">
      {questionTypeOptions.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-brand-subtle" onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }}>
        <span className="flex-1"><span className="block text-body font-medium">{option.label}</span><span className="block text-caption text-muted">{option.description}</span></span>
        {value === option.value && <Icon name="check" />}
      </button>)}
    </div>}
  </div>
}
