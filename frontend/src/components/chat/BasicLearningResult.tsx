import { PostResultNotes } from './PostResultNotes'
import { QuestionBubble } from './QuestionBubble'
import { ResultConversation } from './ResultConversation'
import { Button } from '../ui/Button'
import { useBasicLearningResult } from '../../hooks/useBasicLearningResult'
import type { LockedChat } from '../../types/chat'
import type { BasicLearningTransition } from '../../types/learning'
import type { BasicLearningResult as Result } from '../../types/basicLearningResult'
import { useAnalysisCancellation } from '../../hooks/useAnalysisCancellation'

function LearningContent({ result }: { result: Result }) {
  return <div className="flex flex-col gap-3.5">
    <section aria-label="AI의 참고 관점" className="rounded-learning-card bg-ai-surface p-4">
      <h3 className="text-body font-medium">AI의 참고 관점</h3>
      <p className="mt-2 whitespace-pre-wrap text-body break-words">{result.referenceAnswer}</p>
    </section>
    <section aria-label="기초 개념과 시작 방법" className="flex flex-col gap-3 rounded-learning-card border border-line px-learning-card py-4">
      <span className="self-start rounded-full border border-basic-line px-2.5 py-0.5 text-caption font-medium text-basic-fg">기초 학습</span>
      <h3 className="text-body-lg font-medium">작은 예시부터 시작해요</h3>
      <p className="whitespace-pre-wrap text-body text-secondary break-words">{result.concept}</p>
      <div className="flex flex-col gap-1.5">
        <h4 className="text-caption font-medium text-muted">직접 따라 해 볼 작은 예시</h4>
        <pre className="overflow-x-auto rounded-lg bg-code-bg px-3.5 py-2.5 font-code text-code"><code>{result.exampleCode}</code></pre>
      </div>
      <div className="grid grid-cols-2 gap-2.5" aria-label="기초 학습 시작 방법">
        {result.steps.map((step, index) => <section key={index} className="min-w-0 rounded-[10px] bg-sidebar px-3.5 py-3"><h4 className="text-caption font-medium text-muted">{step.title}</h4><p className="mt-1 whitespace-pre-wrap text-body break-words">{step.text}</p></section>)}
      </div>
    </section>
    <p className="text-caption text-secondary">AI도 중요한 조건을 놓칠 수 있어요. 실제 코드와 실행 결과로 확인해 보세요.</p>
  </div>
}

export function BasicLearningResult({ chat, transition, draft, onReconcile = () => {} }: { chat: LockedChat; transition: BasicLearningTransition; draft: string; onReconcile?: () => void }) {
  const { state, reload, pause } = useBasicLearningResult(transition)
  const cancellation = useAnalysisCancellation(chat.id, state.status === 'loading' ? { learningPath: 'BASIC', jobId: transition.transitionId } : null, pause, onReconcile, 'BASIC')
  const ready = state.status === 'ready' && !cancellation.uncertain
  return <ResultConversation chat={chat} ready={ready} analysisCancel={state.status === 'loading' || cancellation.uncertain ? { busy: cancellation.busy, onCancel: cancellation.cancel } : undefined}>
    <QuestionBubble draft={chat} />
    <section aria-label="기초 학습 결과" className="flex flex-col gap-3.5" aria-busy={state.status === 'loading'}>
      <p className="text-caption text-secondary">StackOverGrow</p>
      <h2 className="text-body-lg font-medium">기초부터 함께 살펴볼게요.</h2>
      {state.status === 'loading' && <p role="status" className="rounded-learning-card bg-ai-surface p-4 text-body text-secondary motion-safe:animate-pulse">기초 개념과 작은 예시를 불러오고 있어요…</p>}
      {state.status === 'error' && <div role="alert" className="rounded-learning-card border border-line p-4"><p className="text-body text-secondary">{state.message}</p><Button className="mt-2 text-body text-brand underline" onClick={reload}>기초 학습 다시 불러오기</Button></div>}
      {cancellation.error && <div role="alert"><p className="text-body text-secondary">{cancellation.error}</p><Button className="mt-2 text-body text-brand underline" onClick={onReconcile}>기초 학습 다시 불러오기</Button></div>}
      {ready && state.status === 'ready' && <><LearningContent result={state.result} /><PostResultNotes key={chat.id} chatId={chat.id} allowFeedback={false} /></>}
    </section>
    {draft && <details className="text-body"><summary className="cursor-pointer text-brand-deep">보관한 생각 초안</summary><p className="mt-2 whitespace-pre-wrap break-words">{draft}</p></details>}
  </ResultConversation>
}
