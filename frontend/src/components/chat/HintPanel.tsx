import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { useHints } from '../../hooks/useHints'
import type { StuckPoint } from '../../types/hints'

const points: { value: StuckPoint; label: string }[] = [
  { value: 'CONCEPT', label: '개념이 낯설어요' },
  { value: 'FLOW', label: '코드 흐름이 어려워요' },
  { value: 'VERIFICATION', label: '검증 방법을 모르겠어요' },
]
export function HintPanel({ hints, onReturn }: { hints: ReturnType<typeof useHints>; onReturn: () => void }) {
  const current = hints.state?.hints.at(-1)
  return <div className="flex flex-col gap-2" aria-label="단계별 힌트" aria-busy={hints.busy}>
    <div className="rounded-hint bg-ai-surface px-hint-x py-hint-y">
      {current ? <>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-caption font-medium text-muted">힌트 {current.level} / 2</h3>
          {current.level === 1 ? <Button className="gap-1 text-caption text-brand" disabled={hints.busy} onClick={hints.openSecond}>조금 더 힌트 주세요<Icon name="hintNext" /></Button> : <Icon name="hintSteps" />}
        </div>
        <p className="mt-0.5 text-body" aria-live="polite">{current.text}</p>
      </> : <Button className="text-body text-brand-deep" disabled={hints.busy || !hints.state} onClick={hints.openFirst}>아직 감이 안 와요 · 힌트</Button>}
      {hints.busy && <p role="status" className="mt-1 text-caption text-muted">힌트 상태를 확인하고 있어요…</p>}
      {hints.error && <div role="alert" className="mt-2 text-body text-danger"><p>{hints.error}</p><Button className="mt-1 underline" disabled={hints.busy} onClick={hints.retry}>힌트 다시 확인하기</Button></div>}
      <div className="mt-2 border-t border-brand-soft pt-2"><Button className="text-body text-brand-deep" onClick={onReturn}>내 생각 적어 볼게요</Button></div>
    </div>
    {!!hints.state?.level && <fieldset className="px-hint-x py-1" disabled={hints.busy}>
      <legend className="text-caption text-secondary">어디서 막혔나요? <span className="ml-2 text-micro text-muted">{hints.busy ? '저장 중…' : '기록용으로, 선택사항이에요'}</span></legend>
      <div className="flex flex-wrap gap-2.5">
        {points.map(point => {
          const selected = hints.state?.stuckPoint === point.value
          return <label key={point.value} className={`relative flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-caption has-focus-visible:outline-2 has-focus-visible:outline-brand ${selected ? 'font-medium text-brand-deep' : 'text-secondary hover:underline'}`}>
            <input type="radio" name={`stuck-${hints.state?.chatId}`} value={point.value} checked={selected} onChange={() => hints.choose(point.value)} className="sr-only" />
            {selected && <Icon name="hintCheck" />}{point.label}
          </label>
        })}
      </div>
    </fieldset>}
  </div>
}
