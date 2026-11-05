import { Card } from '../ui/Card'
import { exampleQuestions } from '../../data/newChat'

export function Welcome({ onSelect }: { onSelect: (question: string) => void }) {
  return <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pt-welcome-offset" aria-labelledby="welcome-heading">
    <div className="flex max-w-full flex-col items-center gap-4">
      <h2 id="welcome-heading" className="text-center text-display font-semibold">무엇이 궁금하거나 막혔나요?</h2>
      <p className="text-center text-body-lg text-secondary">질문을 보내면 AI 답변은 접어 두고, 내 생각부터 적어 보게 해요.</p>
      <div className="flex flex-col items-center gap-2.5 pt-examples-offset">
        <p className="text-caption text-muted">예시로 시작해 보기</p>
        <div className="grid grid-cols-3 gap-3">
          {exampleQuestions.map(item => <Card key={item.label} className="w-example max-w-full overflow-hidden">
            <button type="button" onClick={() => onSelect(item.question)} className="flex h-full w-full flex-col gap-1.5 p-4 text-left transition-colors hover:bg-brand-subtle focus-visible:outline-offset-[-3px]">
              <span className="text-caption font-medium leading-4 text-brand-deep">{item.label}</span>
              <span className="text-body font-medium">{item.question}</span>
            </button>
          </Card>)}
        </div>
      </div>
    </div>
  </section>
}
