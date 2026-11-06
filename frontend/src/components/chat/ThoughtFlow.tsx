import { useEffect, useRef } from 'react'
import { QuestionBubble } from './QuestionBubble'
import { QuestionComposer } from './QuestionComposer'
import { LockedAnswer } from './LockedAnswer'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useThoughtSubmission } from '../../hooks/useThoughtSubmission'
import type { LockedChat } from '../../types/chat'

export function ThoughtFlow({ chat }: { chat: LockedChat }) {
  const thought = useThoughtSubmission(chat.id)
  const conversation = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (thought.phase !== 'writing') conversation.current?.scrollTo({ top: conversation.current.scrollHeight })
  }, [thought.phase])
  function insert(text: string) {
    thought.insert(text)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="내 생각"]')?.focus())
  }
  return <>
    <div ref={conversation} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mx-auto flex w-full max-w-content flex-col gap-5">
        <QuestionBubble draft={chat} />
        {thought.phase === 'writing' ? <LockedAnswer chat={chat} thought={thought.draft} onInsert={insert} /> : <>
          <div className="flex justify-end"><section aria-label="제출한 내 생각" className="w-question-bubble max-w-full rounded-composer bg-sidebar px-4 py-2.5"><p className="whitespace-pre-wrap text-body-lg break-words">{thought.receipt?.thought ?? thought.draft}</p></section></div>
          <section aria-label="생각 제출 상태" aria-busy={thought.phase === 'submitting'}>
            <p className="text-caption text-secondary">Deveil</p>
            {thought.phase === 'submitting' && <p role="status" className="mt-2 text-body-lg text-muted motion-safe:animate-pulse">내 생각을 안전하게 저장하고 있어요…</p>}
            {thought.phase === 'pending' && <div role="status"><p className="mt-2 text-body-lg text-muted motion-safe:animate-pulse">내 생각을 보존하고, 두 관점을 연결하고 있어요…</p><p className="mt-2 text-caption text-muted">분석 대기 중 · AI 답변은 아직 잠겨 있어요.</p></div>}
            {thought.phase === 'failed' && <div role="alert"><p className="mt-2 text-body text-secondary">{thought.feedback}</p><Button className="mt-2 gap-1.5 text-body text-danger" onClick={thought.retry}>다시 제출해 볼게요<Icon name="retry" /></Button></div>}
          </section>
        </>}
      </div>
    </div>
    <QuestionComposer draft={chat} mode="locked" validation="" onChange={() => {}} onSubmit={() => {}}
      thought={thought.draft} onThoughtChange={thought.change} thoughtPhase={thought.phase}
      thoughtFeedback={thought.feedback} onThoughtSubmit={thought.submit} onThoughtBlur={thought.check} />
  </>
}
