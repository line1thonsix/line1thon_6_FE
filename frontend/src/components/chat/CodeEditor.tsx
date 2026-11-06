import { useRef } from 'react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Textarea } from '../ui/Input'
import { CODE_MAX_LENGTH } from '../../api/chatValidation'

type Props = { value: string; expanded: boolean; onChange: (value: string) => void; onToggle: () => void }
export function CodeEditor({ value, expanded, onChange, onToggle }: Props) {
  const gutter = useRef<HTMLPreElement>(null)
  return <section className="rounded-lg bg-code-bg" aria-label="코드 첨부">
    <div className="flex items-center justify-between pt-2 pr-2 pb-1 pl-3.5">
      <span className="flex items-center gap-1.5 text-caption text-secondary"><Icon name="code" />코드</span>
      <div className="flex items-center gap-1.5"><span id="code-count" className={`text-caption ${value.length > CODE_MAX_LENGTH ? 'text-danger' : 'text-muted'}`}>{value.length.toLocaleString()} / 6,000</span><Button className="size-7" aria-label={expanded ? '코드 줄이기' : '코드 크게 보기'} aria-expanded={expanded} onClick={onToggle}><Icon name={expanded ? 'collapse' : 'expand'} /></Button></div>
    </div>
    <div className="flex min-w-0">
      {expanded && <pre ref={gutter} aria-hidden="true" className="h-code-expanded shrink-0 overflow-hidden pt-1 pr-4 pb-3.5 pl-3.5 text-right font-code text-code text-muted">{value.split('\n').map((_, index) => index + 1).join('\n')}</pre>}
      <Textarea wrap="off" onScroll={event => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop }} aria-label="코드 입력" aria-describedby="code-count" aria-invalid={value.length > CODE_MAX_LENGTH} value={value} onChange={event => onChange(event.target.value)} placeholder="확인하고 싶은 코드를 붙여 넣으세요" spellCheck={false} className={`block min-w-0 flex-1 resize-none border-0 bg-transparent pt-1 pb-3.5 ${expanded ? 'pr-3.5 pl-0' : 'px-3.5'} font-code text-code ${expanded ? 'h-code-expanded' : 'h-code-editor'}`} />
    </div>
  </section>
}
