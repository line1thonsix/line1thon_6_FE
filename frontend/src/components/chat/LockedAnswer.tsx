import { helpTabs } from '../../data/helpTabs'
import type { useHints } from '../../hooks/useHints'
import { HintPanel } from './HintPanel'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { LockedChat } from '../../types/chat'

type Props = { chat: LockedChat; selectedChoice: number | null; onChoice: (index: number) => void; hints: ReturnType<typeof useHints> }
export function LockedAnswer({ chat, selectedChoice, onChoice, hints }: Props) {
  const tab = hints.tab
  function returnToThought() {
    hints.select('choices')
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="내 생각"]')?.focus())
  }
  return <section className="flex flex-col gap-2" aria-label="잠긴 AI 답변">
    <p className="text-caption text-secondary">Deveil</p>
    <div><p className="text-body-lg">AI의 답을 보기 전에, 먼저 내 생각을 적어 볼까요?</p><p className="mt-1 text-body text-secondary">시작이 어렵다면 아래에서 하나를 골라 보세요.</p></div>
    <Card surface="subtle" className="relative flex min-h-lock-card flex-col items-center justify-center overflow-hidden p-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-5 flex flex-col justify-center gap-3 opacity-25 blur-[5px]">
        <span className="h-2 w-full rounded-full bg-line-strong" /><span className="h-2 w-5/6 rounded-full bg-line-strong" /><span className="h-2 w-4/5 rounded-full bg-line-strong" />
      </div>
      <div className="relative flex items-center gap-2.5"><Icon name="lock" /><h2 className="text-subhead font-medium">AI 답변은 잠시 접어 뒀어요</h2><span className="rounded-control bg-brand-soft px-2 py-0.5 text-caption font-medium text-brand-deep">잠금</span></div>
      <p className="relative text-center text-body text-secondary">내 생각을 한 번 남기면 함께 열어 볼 수 있어요. 맞는 답을 써야 하는 건 아니에요.</p>
    </Card>
    <div role="tablist" aria-label="시작 도움" className="flex gap-0.5 rounded-full bg-tab-bg p-1.5">
      {helpTabs.map(item => <button key={item.id} type="button" role="tab" aria-label={item.id === 'hints' ? '아직 감이 안 와요 · 힌트' : undefined} id={`tab-${item.id}`} aria-controls="help-panel" aria-selected={tab === item.id} onClick={() => hints.select(item.id)} className={`flex flex-1 flex-col items-center rounded-full border px-4 py-1.5 ${tab === item.id ? 'border-brand bg-page text-brand-deep' : 'border-transparent text-secondary'}`}><span className="text-body">{item.label}</span><span className="text-caption text-muted">{item.description}</span></button>)}

    </div>
    <div role="tabpanel" id="help-panel" aria-labelledby={`tab-${tab}`}>
      {tab === 'hints' ? <HintPanel hints={hints} onReturn={returnToThought} /> : <div className="flex flex-wrap gap-2">{chat.choices.map((choice, index) => <Button key={choice} data-thought-choice variant="soft" aria-pressed={selectedChoice === index} className={`rounded-full border px-3.5 py-2 text-body text-ink ${selectedChoice === index ? 'border-brand' : 'border-transparent'}`} onClick={() => onChoice(index)}>{selectedChoice === index && <Icon name="checkChoice" />}{choice}</Button>)}</div>}
    </div>
  </section>
}
