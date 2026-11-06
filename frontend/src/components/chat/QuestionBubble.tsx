import { useState } from 'react'
import { Icon } from '../ui/Icon'
import type { QuestionDraft } from '../../types/chat'

export function QuestionBubble({ draft }: { draft: QuestionDraft }) {
  const [expanded, setExpanded] = useState(false)
  return <div className="flex justify-end">
    <section aria-label="전송한 질문" className="w-question-bubble max-w-full rounded-composer bg-sidebar px-4 py-2.5">
      <p className="whitespace-pre-wrap text-body-lg break-words">{draft.question}</p>
      {draft.code && <div className="relative mt-1.5 overflow-hidden rounded-lg border border-line bg-page px-3.5 py-2">
        <button type="button" aria-label={expanded ? '첨부 코드 접기' : '첨부 코드 펼치기'} aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className="flex w-full items-center justify-between text-caption text-secondary"><span className="flex items-center gap-1.5"><Icon name="code" />코드<span className="text-muted">{draft.code.split('\n').length}줄</span></span><Icon name="codeChevron" /></button>
        <pre className={`mt-1.5 overflow-auto font-code text-code whitespace-pre ${expanded ? 'max-h-code-expanded' : 'max-h-code-preview'}`}><code>{draft.code}</code></pre>
        {!expanded && draft.code.split('\n').length > 4 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-page" />}
      </div>}
    </section>
  </div>
}
