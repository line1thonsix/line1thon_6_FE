import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { useHints } from '../../hooks/useHints'
import type { StuckPoint } from '../../types/hints'

const points: { value: StuckPoint; label: string }[] = [
  { value: 'CONCEPT', label: '개념이 낯설어요' },
  { value: 'FLOW', label: '코드 흐름이 어려워요' },
  { value: 'VERIFICATION', label: '검증 방법을 모르겠어요' },
]
export function HintPanel({ hints }: { hints: ReturnType<typeof useHints> }) {
  const current = hints.currentHint
  const eligible = hints.state?.level === 2
  return <div className="flex flex-col gap-2" aria-label="단계별 힌트" aria-busy={hints.busy}>
    <div className="rounded-hint bg-ai-surface px-hint-x py-hint-y">
      {current ? <>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-caption font-medium text-muted">힌트 {current.level} / 2</h3>
          {current.level === 1 ? <Button variant="plain" className="gap-1 text-caption text-brand" disabled={hints.busy} onClick={hints.openSecond}>힌트를 더 볼까요?<Icon name="hintNext" /></Button> : <Button variant="plain" className="gap-1 text-caption text-brand" disabled={hints.busy} onClick={hints.viewFirst}><span className="rotate-180"><Icon name="hintNext" /></span>이전 힌트 보기</Button>}
        </div>
        <p className="mt-0.5 text-body" aria-live="polite">{current.text}</p>
      </> : <Button className="text-body text-brand-deep" disabled={hints.busy || !hints.state} onClick={hints.openFirst}>아직 감이 안 와요 · 힌트</Button>}
      {hints.busy && !hints.transitioning && <p role="status" className="mt-1 text-caption text-muted">힌트 상태를 확인하고 있어요…</p>}
      {hints.error && <div role="alert" className="mt-2 text-body text-danger"><p>{hints.error}</p><Button className="mt-1 underline" disabled={hints.busy} onClick={hints.retry}>힌트 다시 확인하기</Button></div>}
      {current?.level === 2 && <Button variant="plain" className="mt-2 w-full border-t border-brand-soft pt-2 text-body text-secondary" disabled={hints.busy || hints.uncertain || !eligible} onClick={hints.transition}>
        <span className="flex w-full items-center justify-between gap-3"><span className="flex-1 text-left">그래도 잘 모르겠다면 기초 학습으로 이어서 설명해 드릴게요.</span><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-basic-surface"><Icon name="basicNext" /></span></span>
      </Button>}
    </div>
    {!!hints.state?.level && <fieldset className="px-hint-x py-1" disabled={hints.busy || hints.uncertain}>
      <legend className="text-caption text-secondary">어디서 막혔나요? {hints.busy && <span className="ml-2 text-micro text-muted">저장 중…</span>}</legend>
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
    {hints.uncertain && <div role="status" className="px-hint-x text-body text-secondary"><p>{hints.transitioning ? '기초 학습 전환을 저장하고 있어요…' : '전환 요청의 저장 상태를 확인해 주세요.'}</p>{hints.transitionError && <p role="alert" className="mt-1 text-danger">{hints.transitionError}</p>}<Button className="mt-1 text-brand underline" disabled={hints.busy} onClick={hints.recheckTransition}>전환 다시 확인하기</Button></div>}
  </div>
}
