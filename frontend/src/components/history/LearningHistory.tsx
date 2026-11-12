import { useState } from 'react'
import { Button } from '../ui/Button'
import { clearQuestionTitleTooltip, showQuestionTitleTooltip } from '../ui/questionTitleTooltip'
import { GuestMenu } from '../layout/GuestMenu'
import { filterHistory, groupHistory, historyFilters, historyLabel, historyTime } from '../../data/history'
import type { HistoryFilter, HistoryItem } from '../../types/history'

type Props = { onDelete?: (id: string) => void; items: HistoryItem[]; status: 'loading' | 'ready' | 'error'; error: string; onRetry: () => void; onOpen: (id: string) => void }
export function LearningHistory({ onDelete, items, status, error, onRetry, onOpen }: Props) {
  const [filter, setFilter] = useState<HistoryFilter>('ALL')
  const groups = groupHistory(filterHistory(items, filter))
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-7 pb-4" aria-label="학습 기록 목록" aria-busy={status === 'loading'}>
    <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-5">
      <div role="group" aria-label="학습 기록 필터" className="flex self-start gap-0.5 rounded-full bg-tab-bg p-1">
        {historyFilters.map(item => <Button variant="plain" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={`rounded-full border px-4 py-[7px] text-body ${filter === item.value ? 'border-brand bg-page font-medium text-brand-deep' : 'border-transparent text-secondary'}`}>{item.label}</Button>)}
      </div>
      {status === 'loading' ? <p role="status" className="m-auto text-body text-muted">학습 기록을 불러오고 있어요…</p> : status === 'error' ? <div role="alert" className="m-auto text-center"><p className="text-body text-secondary">{error}</p><Button className="mt-2 text-body text-brand underline" onClick={onRetry}>다시 불러오기</Button></div> : !groups.length ? <p role="status" className="m-auto text-subhead font-medium text-muted">아직 기록이 없어요</p> : groups.map(group => <section key={group.label} aria-label={group.label} className="flex flex-col gap-2">
        <h2 className="text-caption font-medium leading-4 text-muted">{group.label}</h2>
        {group.entries.map(item => <div key={item.id} className="group relative"><Button variant="plain" onClick={() => onOpen(item.id)} aria-label={`${item.question} 대화 열기`} className="group relative w-full justify-start rounded-learning-card border border-line bg-page px-4 py-3.5 text-left transition-colors hover:border-history-hover-line hover:bg-brand-subtle focus-visible:border-history-hover-line focus-visible:bg-brand-subtle">
          <span className="flex min-w-0 flex-1 flex-col gap-1 pr-6">
            <span className="flex items-center gap-2"><span title={item.learningPath === 'BASIC' ? '도움받아 학습' : item.learningPath === 'SELF' ? '직접 생각 작성' : undefined} className={`rounded-full border px-2 py-0.5 text-caption font-medium leading-4 ${item.learningPath === 'BASIC' ? 'border-basic-line text-basic-fg' : 'border-hold-line text-hold-fg'}`}>{historyLabel(item)}</span><time dateTime={item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined} className="text-caption text-muted">{historyTime(item.updatedAt)}</time></span>
            <span className="line-clamp-2 wrap-anywhere text-body-lg leading-6 font-medium" onMouseEnter={showQuestionTitleTooltip} onMouseLeave={clearQuestionTitleTooltip}>{item.question}</span>
            {item.reflection && <span className="text-caption text-secondary break-words">{item.reflection}</span>}
          </span>
        </Button><GuestMenu conversation onDelete={onDelete ? () => onDelete(item.id) : undefined} /></div>)}
      </section>)}
    </div>
  </div>
}
