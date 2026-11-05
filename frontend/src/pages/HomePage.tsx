import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Welcome } from '../components/chat/Welcome'
import { QuestionComposer } from '../components/chat/QuestionComposer'

export function HomePage() {
  const [draft, setDraft] = useState('')
  const [revision, setRevision] = useState(0)
  return <AppShell title="새 채팅" onNewChat={() => { setDraft(''); setRevision(value => value + 1) }}>
    <main className="flex min-h-0 flex-1 flex-col">
      <Welcome onSelect={setDraft} />
      <QuestionComposer key={revision} value={draft} onChange={setDraft} />
    </main>
  </AppShell>
}
