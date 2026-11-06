import { useEffect, useRef, useState } from 'react'
import { fetchMockComparison } from '../api/comparison'
import type { AnalysisCompletion } from '../types/analysis'
import type { ComparisonResult } from '../types/comparison'

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; result: ComparisonResult }
export function useComparisonResult(completion: AnalysisCompletion, thought: string) {
  const [response, setResponse] = useState<{ key: string; state: State } | null>(null)
  const [cycle, setCycle] = useState(0)
  const active = useRef<AbortController | null>(null)
  const { chatId, jobId, resultId } = completion
  const key = JSON.stringify([chatId, jobId, resultId, thought, cycle])
  useEffect(() => {
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 10000)
    fetchMockComparison({ chatId, jobId, resultId }, thought, controller.signal).then(
      result => { if (active.current === controller) setResponse({ key, state: { status: 'ready', result } }) },
      error => { if (active.current === controller) setResponse({ key, state: { status: 'error', message: controller.signal.aborted ? '결과 연결이 지연되고 있어요. 내 생각은 그대로 있어요.' : error instanceof Error ? error.message : '결과를 불러오지 못했어요.' } }) },
    ).finally(() => clearTimeout(timeout))
    return () => { if (active.current === controller) active.current = null; clearTimeout(timeout); controller.abort() }
  }, [chatId, jobId, resultId, thought, key])
  const state: State = response?.key === key ? response.state : { status: 'loading' }
  return { state, reload: () => setCycle(value => value + 1) }
}
