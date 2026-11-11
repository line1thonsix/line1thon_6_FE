import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import type { AnalysisController } from '../../hooks/useAnalysis'

export function AnalysisStatus({ analysis }: { analysis: AnalysisController }) {
  const { snapshot, connectionError, retrying, completion } = analysis
  const exhausted = snapshot?.status === 'FAILED' && snapshot.attempt >= 3
  return <section aria-label="분석 상태" aria-busy={retrying || !snapshot || snapshot.status === 'PENDING'}>
    <p className="text-caption text-secondary">StackOverGrow</p>
    {(!snapshot || snapshot.status === 'PENDING' || retrying) && <p role="status" className="mt-2 text-body-lg text-muted motion-safe:animate-pulse">두 관점을 연결하고 있어요…</p>}
    {snapshot && <p className="mt-2 text-caption text-muted">분석 시도 {snapshot.attempt} / {snapshot.maxAttempts}</p>}
    {snapshot?.status === 'FAILED' && !retrying && <div role="alert">
      <p className="mt-2 text-body text-secondary">연결이 지연되고 있어요. 내 생각은 그대로 있어요.</p>
      {snapshot.reason === 'INVALID_OUTPUT' && <p className="mt-1 text-caption text-muted">유효한 비교 항목을 확인하지 못했어요. 내 생각은 보존되어 있어요.</p>}
      {snapshot.reason === 'TIMEOUT' && <p className="mt-1 text-caption text-muted">이번 분석이 90초를 넘어 중단되었어요.</p>}
      {exhausted ? <p className="mt-2 text-body text-secondary">분석을 3회 시도했어요. 내 생각은 보존되며, AI 답변은 계속 잠겨 있어요.</p> :
        <Button className="mt-2 gap-1.5 text-body text-danger!" onClick={analysis.retry} disabled={retrying}>다시 연결해 볼게요<Icon name="retry" /></Button>}
    </div>}
    {connectionError && <div role="status" className="mt-2 text-body text-secondary"><p>분석 상태를 확인하지 못했어요. 내 생각은 그대로 있어요.</p><Button className="mt-2 text-body underline" disabled={retrying} onClick={analysis.reconnect}>상태 다시 확인</Button></div>}
    {completion && <section aria-label="관점 비교 연결 준비" role="status"><p className="mt-2 text-body-lg">분석이 완료되었어요.</p><p className="mt-2 text-body text-secondary">관점 비교를 준비했어요. 결과 화면은 다음 단계에서 연결할 예정이에요.</p></section>}
  </section>
}
