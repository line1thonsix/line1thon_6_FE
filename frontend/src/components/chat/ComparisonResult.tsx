import { PostResultNotes } from './PostResultNotes'
import { Button } from '../ui/Button'
import { FindingCard } from './FindingCard'
import type { ComparisonResult as Result } from '../../types/comparison'
import type { AnalysisCompletion } from '../../types/analysis'
import { comparisonDisclaimer } from '../../data/comparison'
import { useComparisonResult } from '../../hooks/useComparisonResult'
import { ResultConversation } from './ResultConversation'
import { QuestionBubble } from './QuestionBubble'
import type { LockedChat } from '../../types/chat'

export function ComparisonContent({ result }: { result: Result }) {
  return <section aria-label="관점 비교 결과" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-body-lg">이제 두 관점을 함께 볼까요?</p>{result.responseSource === 'SAVED_EXAMPLE' && <span className="rounded-control bg-brand-subtle px-2 py-1 text-caption text-brand-deep">저장 예시</span>}</div>
    <div className="grid grid-cols-2 gap-3" aria-label="두 관점 비교">
      <section className="rounded-panel bg-me-surface p-4" aria-label="나의 첫 생각"><h2 className="text-body font-medium">나의 첫 생각</h2><p className="mt-2 whitespace-pre-wrap text-body break-words">{result.thought}</p></section>
      <section className="rounded-panel bg-ai-surface p-4" aria-label="AI의 참고 관점"><h2 className="text-body font-medium">AI의 참고 관점</h2><p className="mt-2 whitespace-pre-wrap text-body break-words">{result.referenceAnswer}</p></section>
    </div>
    <p className="sr-only" role="status">비교 항목 {result.findings.length}개</p>
    <div className="flex flex-col gap-2.5" aria-label="비교 항목 목록">{result.findings.map(finding => <FindingCard key={finding.id} finding={finding} />)}</div>
    <p className="text-caption text-muted">{comparisonDisclaimer}</p>
    <PostResultNotes key={result.chatId} chatId={result.chatId} />
  </section>
}

export function ComparisonResult({ completion, thought, chat }: { completion: AnalysisCompletion; thought: string; chat: LockedChat }) {
  const { state, reload } = useComparisonResult(completion, thought)
  return <ResultConversation chat={chat} ready={state.status === 'ready'}>
    <QuestionBubble draft={chat} />
    <div className="flex justify-end"><section aria-label="제출한 내 생각" className="w-question-bubble max-w-full rounded-composer bg-sidebar px-4 py-2.5"><p className="whitespace-pre-wrap text-body-lg break-words">{thought}</p></section></div>
    <div className="flex flex-col gap-3"><p className="text-caption text-secondary">Deveil</p>
    {state.status === 'loading' && <p role="status" className="text-body-lg text-muted">비교 결과를 불러오고 있어요…</p>}
    {state.status === 'error' && <div role="alert"><p className="text-body text-secondary">{state.message}</p><Button className="mt-2 text-body text-brand underline" onClick={reload}>결과 다시 불러오기</Button></div>}
    {state.status === 'ready' && <ComparisonContent key={state.result.resultId} result={state.result} />}
  </div></ResultConversation>
}
