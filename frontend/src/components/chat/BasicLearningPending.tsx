import { QuestionBubble } from './QuestionBubble'
import type { LockedChat } from '../../types/chat'
import type { BasicLearningTransition } from '../../types/learning'

// F-12 handoff boundary only: no answer, basic explanation or comparison is fetched here.
export function BasicLearningPending({ chat, transition, draft }: { chat: LockedChat; transition: BasicLearningTransition; draft: string }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4"><div className="mx-auto flex w-full max-w-content flex-col gap-5">
    <QuestionBubble draft={chat} />
    <section aria-label="기초 학습 연결 대기" className="rounded-panel bg-ai-surface p-5">
      <span className="rounded-control bg-brand-soft px-2 py-1 text-caption text-brand-deep">도움받아 학습</span>
      <h2 className="mt-3 text-subhead">기초 학습으로 이어갈 준비가 되었어요</h2>
      <p role="status" className="mt-2 text-body text-secondary">기초 학습 연결 대기 중이에요.</p>
      <p className="mt-1 text-caption text-muted">이 경로는 성장 지표에 포함되지 않아요.</p>
      {draft && <details className="mt-4 text-body"><summary className="cursor-pointer text-brand-deep">보관한 생각 초안</summary><p className="mt-2 whitespace-pre-wrap break-words">{draft}</p></details>}
      <span className="sr-only">학습 경로 {transition.learningPath}</span>
    </section>
  </div></div>
}
