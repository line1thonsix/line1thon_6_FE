import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Welcome } from '../components/chat/Welcome'
import { QuestionComposer } from '../components/chat/QuestionComposer'
import { QuestionBubble } from '../components/chat/QuestionBubble'
import { ThoughtFlow } from '../components/chat/ThoughtFlow'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { useQuestionFlow } from '../hooks/useQuestionFlow'
import { exampleQuestions } from '../data/newChat'

export function HomePage() {
  const { draft, flow, validation, submit, reset, updateDraft, retry } = useQuestionFlow()
  const [revision, setRevision] = useState(0)
  return <AppShell title={flow.stage === 'editing' ? '새 채팅' : draft.question} currentQuestion={flow.stage === 'editing' ? undefined : draft.question} onNewChat={() => { reset(); setRevision(v => v + 1) }}>
    <main className="flex min-h-0 flex-1 flex-col">
      {flow.stage === 'locked' ? <ThoughtFlow key={flow.chat.id} chat={flow.chat} /> : <>
        {flow.stage === 'editing' ? <Welcome onSelect={question => {
          const example = exampleQuestions.find(item => item.question === question)
          submit({ question, code: '', type: example?.type ?? 'FREE' })
        }} /> : <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" aria-busy={flow.stage === 'creating'}>
          <div className="mx-auto flex w-full max-w-content flex-col gap-5">
            <QuestionBubble key={revision} draft={draft} />
            {flow.stage === 'creating' && <div role="status"><p className="text-caption text-secondary">Deveil</p><p className="mt-2 text-body-lg text-muted motion-safe:animate-pulse">질문을 읽고 있어요…</p></div>}
            {flow.stage === 'error' && <div role="alert"><p className="text-caption text-secondary">Deveil</p><p className="mt-2 text-body text-secondary">{flow.message}</p><Button className="mt-2 gap-1.5 text-body text-danger" onClick={retry}>다시 시도해 주세요<Icon name="retry" /></Button></div>}
          </div>
        </div>}
        <QuestionComposer key={revision} draft={draft} mode={flow.stage} validation={validation} onChange={updateDraft} onSubmit={() => submit()} thought="" onThoughtChange={() => {}} />
      </>}
    </main>
  </AppShell>
}
