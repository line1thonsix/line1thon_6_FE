import { questionTypeLabel } from '../../data/questionTypes'
import { useHints } from '../../hooks/useHints'
import type { BasicLearningTransition } from '../../types/learning'
import { BasicLearningResult } from './BasicLearningResult'
import { useEffect, useRef } from 'react'
import { QuestionBubble } from './QuestionBubble'
import { QuestionComposer } from './QuestionComposer'
import { ComparisonResult } from './ComparisonResult'
import { AnalysisStatus } from './AnalysisStatus'
import { LockedAnswer } from './LockedAnswer'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useAnalysis } from '../../hooks/useAnalysis'
import { useThoughtSubmission } from '../../hooks/useThoughtSubmission'
import type { PendingThought } from '../../types/thought'
import type { LockedChat } from '../../types/chat'

export function ThoughtFlow({ chat, restoredReceipt, restoredBasic }: { chat: LockedChat; restoredReceipt?: PendingThought | null; restoredBasic?: BasicLearningTransition }) {
  const thought = useThoughtSubmission(chat, restoredReceipt)
  const hints = useHints(chat.id, thought.canStartBasic)
  const basicLearning = restoredBasic ?? hints.state?.basicLearning
  const analysis = useAnalysis(chat.id, thought.receipt?.analysis.jobId ?? null)
  const completedResultId = analysis.completion?.resultId
  const conversation = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (completedResultId) conversation.current?.scrollTo({ top: 0 })
    else if (thought.phase !== 'writing') conversation.current?.scrollTo({ top: conversation.current.scrollHeight })
  }, [thought.phase, completedResultId])
  function insert(text: string) {
    thought.insert(text)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="내 생각"]')?.focus())
  }
  function selectChoice(index: number) {
    thought.selectChoice(index)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="내 생각"]')?.focus())
  }
  if (basicLearning) return <BasicLearningResult chat={chat} transition={basicLearning} draft={thought.draft} />
  return <>
    <div ref={conversation} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mx-auto flex w-full max-w-content flex-col gap-5">
        <QuestionBubble draft={chat} />
        {chat.classification?.source === 'MOCK_AUTO' && <p role="status" className="text-caption text-secondary">Mock 자동 분류: {questionTypeLabel(chat.type)}</p>}
        {chat.classification?.source === 'FALLBACK' && <p role="status" className="text-caption text-secondary">유형을 분류하지 못해 자유롭게로 진행해요.</p>}
        {thought.phase === 'writing' ? <LockedAnswer hints={hints} chat={chat} selectedChoice={thought.selectedChoice} onChoice={selectChoice} onInsert={insert} /> : <>
          <div className="flex justify-end"><section aria-label="제출한 내 생각" className="w-question-bubble max-w-full rounded-composer bg-sidebar px-4 py-2.5"><p className="whitespace-pre-wrap text-body-lg break-words">{thought.receipt?.thought ?? thought.draft}</p></section></div>
          {thought.phase !== 'pending' && <section aria-label="생각 제출 상태" aria-busy={thought.phase === 'submitting'}>
            <p className="text-caption text-secondary">Deveil</p>
            {thought.phase === 'submitting' && <p role="status" className="mt-2 text-body-lg text-muted motion-safe:animate-pulse">내 생각을 안전하게 저장하고 있어요…</p>}

            {thought.phase === 'failed' && <div role="alert"><p className="mt-2 text-body text-secondary">{thought.feedback}</p><Button className="mt-2 gap-1.5 text-body text-danger" onClick={thought.retry}>다시 제출해 볼게요<Icon name="retry" /></Button></div>}
          </section>}
          {thought.phase === 'pending' && thought.receipt && (analysis.completion
            ? <ComparisonResult completion={analysis.completion} thought={thought.receipt.thought} />
            : <AnalysisStatus analysis={analysis} />)}
        </>}
      </div>
    </div>
    {!analysis.completion && <QuestionComposer draft={chat} mode="locked" validation="" onChange={() => {}} onSubmit={() => {}}
      thoughtBlocked={hints.transitionBlocked} thought={thought.draft} thoughtManual={thought.manual} getThoughtDraft={thought.getDraft} onThoughtRestore={thought.restoreEditor} onThoughtChange={thought.change} thoughtPhase={thought.phase}
      thoughtActionLabel={!analysis.retrying && analysis.snapshot?.status === 'FAILED' ? '분석 실패' : analysis.completion ? '분석 완료' : '분석 대기 중'}
      thoughtFeedback={thought.feedback} onThoughtSubmit={() => { if (hints.canWrite()) thought.submit() }} onThoughtBlur={thought.check} />}
  </>
}
