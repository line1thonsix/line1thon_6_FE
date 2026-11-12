import { useId, useState } from 'react'
import { Icon } from '../ui/Icon'
import type { Finding, FindingCategory } from '../../types/comparison'
import { emptyFindingMessage, findingPresentation } from '../../data/comparison'

const emptyFindingSurface: Record<FindingCategory, string> = {
  COMMON: 'rounded-lg bg-me-surface',
  CONFLICT: 'rounded-lg bg-me-surface',
  COMPLEMENT: 'rounded-[10px] bg-ai-surface',
  UNIQUE: 'rounded-[10px] bg-me-surface',
  UNDETERMINED: 'rounded-lg bg-hold-surface',
}

export function EmptyFindingCard({ category }: { category: FindingCategory }) {
  const presentation = findingPresentation[category]
  return <article className={`finding-card ${presentation.style}`} aria-label={presentation.label}>
    <div className="flex items-center gap-2"><span className="finding-badge">{presentation.label}</span></div>
    <div className={`mt-2 flex min-h-[48px] items-center px-3.5 py-3 ${emptyFindingSurface[category]}`}>
      <p className="text-caption font-medium leading-4 text-muted">{emptyFindingMessage[category]}</p>
    </div>
  </article>
}

export function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const presentation = findingPresentation[finding.category]
  return <article className={`finding-card ${presentation.style}`} aria-label={`${presentation.label}: ${finding.title}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><span className="finding-badge">{presentation.label}</span><h3 className="text-body font-medium">{finding.title}</h3></div>
      <button type="button" aria-label={`${open ? '근거 접기' : '근거 펼치기'}: ${presentation.label}`} aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)} className="flex shrink-0 items-center gap-1 text-caption text-brand">
        근거와 확인 방법 {open ? '접기' : '보기'}<Icon name={open ? 'evidenceUp' : 'evidenceDown'} />
      </button>
    </div>
    {finding.category === 'UNDETERMINED' ? <p className="mt-2 rounded-lg bg-hold-surface px-3 py-2 text-body">{finding.question}</p> : finding.category === 'COMPLEMENT' ? <div aria-label="AI 근거" className="mt-2 flex min-h-[46px] items-center gap-2.5 rounded-[10px] bg-ai-surface px-3.5 py-3">
      <span className="shrink-0 text-caption font-medium leading-4 text-muted">AI</span><p className="min-w-0 flex-1 whitespace-pre-wrap text-body break-words">{finding.aiPerspective}</p>
    </div> : finding.category === 'UNIQUE' ? <div aria-label="내 생각 근거" className="mt-2 flex min-h-[46px] items-center gap-2.5 rounded-[10px] bg-me-surface px-3.5 py-3">
      <span className="shrink-0 text-caption font-medium leading-4 text-muted">내 생각</span><p className="min-w-0 flex-1 whitespace-pre-wrap text-body break-words">{finding.userQuote}</p>
    </div> : <div className="mt-2 grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-me-surface px-3 py-2"><p className="text-caption text-muted">내 생각</p><p className="mt-1 whitespace-pre-wrap text-body break-words">{finding.userQuote}</p></div>
      <div className="rounded-lg bg-ai-surface px-3 py-2"><p className="text-caption text-muted">AI</p><p className="mt-1 whitespace-pre-wrap text-body break-words">{finding.aiPerspective}</p></div>
    </div>}
    {open && <div id={detailId} className="mt-3 border-t border-line pt-3">
      <p className="text-caption text-muted">왜 이렇게 분류했나요?</p><p className="mt-1 whitespace-pre-wrap text-body break-words">{finding.reason}</p>
      {finding.category === 'COMPLEMENT' && finding.conditions && <div className="mt-2"><p className="text-caption text-muted">적용 조건</p><p className="mt-1 text-body">{finding.conditions}</p></div>}
      {finding.category === 'CONFLICT' && finding.conflictEvidence && <div className="mt-2"><p className="text-caption text-muted">충돌 근거</p><p className="mt-1 text-body">{finding.conflictEvidence}</p></div>}
      {finding.verification && <><p className="mt-2 text-caption text-muted">직접 확인하는 방법</p><p className="mt-1 whitespace-pre-wrap text-body break-words">{finding.verification}</p></>}
      {finding.verificationCode && <pre className="mt-2 overflow-x-auto rounded-lg bg-code-bg px-3 py-2 font-code text-code"><code>{finding.verificationCode}</code></pre>}
    </div>}
  </article>
}
