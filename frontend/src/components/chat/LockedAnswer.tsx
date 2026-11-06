import { useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { LockedChat } from '../../types/chat'

type Props = { chat: LockedChat; thought: string; onInsert: (text: string) => void }
export function LockedAnswer({ chat, thought, onInsert }: Props) {
  const [tab, setTab] = useState<'choices' | 'example'>('choices')
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
      {[{ id: 'choices', label: '살펴볼 지점', description: '하나 고르고 이유를 이어 써요' }, { id: 'example', label: '예시 문장', description: '한 문장을 넣고 내 말로 고쳐요' }].map(item => <button key={item.id} type="button" role="tab" id={`tab-${item.id}`} aria-controls="help-panel" aria-selected={tab === item.id} onClick={() => setTab(item.id as typeof tab)} className={`flex flex-1 flex-col items-center rounded-full border px-4 py-1.5 ${tab === item.id ? 'border-brand bg-page text-brand-deep' : 'border-transparent text-secondary'}`}><span className="text-body">{item.label}</span><span className="text-caption text-muted">{item.description}</span></button>)}
      <button type="button" role="tab" disabled aria-selected={false} title="힌트는 다음 단계에서 제공할 예정이에요." className="flex flex-1 flex-col items-center rounded-full border border-transparent px-4 py-1.5 text-secondary"><span className="text-body">힌트</span><span className="text-caption text-muted">정답 없이 단서만 한 단계씩</span></button>
    </div>
    <div role="tabpanel" id="help-panel" aria-labelledby={`tab-${tab}`}>
      {tab === 'choices' ? <div className="flex flex-wrap gap-2">{chat.choices.map(choice => <Button key={choice} variant="soft" aria-pressed={thought.includes(choice)} className={`rounded-full border px-3.5 py-2 text-body text-ink ${thought.includes(choice) ? 'border-brand' : 'border-transparent'}`} onClick={() => onInsert(choice)}>{choice}</Button>)}</div> : <div className="flex items-center gap-3 rounded-full bg-ai-surface py-1.5 pr-1.5 pl-5"><p className="flex-1 text-body">{chat.exampleSentence}</p><Button variant="outline" className="shrink-0 gap-1 rounded-full py-[5px] pr-3.5 pl-2.5 text-body text-brand-deep" onClick={() => onInsert(chat.exampleSentence)}><Icon name="plusExample" />추가</Button></div>}
    </div>
  </section>
}
