import { useFollowUps } from '../../hooks/useFollowUps'
import { Button } from '../ui/Button'

export type FollowUpFlow = ReturnType<typeof useFollowUps>
export function FollowUpMessages({ flow }: { flow: FollowUpFlow }) {
  const { state, retry } = flow
  return <section aria-label="후속 대화" className="flex flex-col gap-5" aria-busy={state.phase === 'loading' || state.phase === 'sending'}>
    {state.items.map(item => <div key={item.id} className="flex flex-col gap-5">
      <div className="flex justify-end"><p className="w-question-bubble max-w-full whitespace-pre-wrap rounded-composer bg-sidebar px-4 py-2.5 text-body-lg break-words">{item.question}</p></div>
      <div><p className="text-caption text-secondary">StackOverGrow</p><p className="mt-2 whitespace-pre-wrap text-body-lg break-words">{item.answer}</p></div>
    </div>)}
    {state.phase === 'sending' && <p role="status" className="text-body text-muted motion-safe:animate-pulse">질문을 읽고 있어요…</p>}
    {state.error && <div role="alert"><p className="text-body text-secondary">{state.error}</p>{state.phase === 'error' && <Button className="mt-2 text-body text-brand underline" onClick={retry}>다시 시도해 주세요</Button>}</div>}
  </section>
}
