import { useEffect, useRef, useState } from 'react'
import { fetchMockBasicLearningResult } from '../api/basicLearningResult'
import type { BasicLearningTransition } from '../types/learning'
import type { BasicLearningResult } from '../types/basicLearningResult'

type State = { status: 'loading' } | { status: 'ready'; result: BasicLearningResult } | { status: 'error'; message: string }
export function useBasicLearningResult(transition: BasicLearningTransition) {
  const { chatId, transitionId } = transition
  const [response, setResponse] = useState<{ key: string; state: State } | null>(null)
  const [cycle, setCycle] = useState(0)
  const active = useRef<AbortController | null>(null)
  const key = JSON.stringify([chatId, transitionId, cycle])
  useEffect(() => {
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 10000)
    // StrictMode replays mount effects. Defer starting I/O until stale effects are cleaned up,
    // otherwise the abandoned first GET can consume a Mock error-once response.
    queueMicrotask(() => {
      if (active.current !== controller || controller.signal.aborted) return
    fetchMockBasicLearningResult({ chatId, transitionId, learningPath: 'BASIC', status: 'AWAITING_CONTENT', excludeFromGrowth: true }, controller.signal).then(
      result => { if (active.current === controller) setResponse({ key, state: { status: 'ready', result } }) },
      error => { if (active.current === controller) setResponse({ key, state: { status: 'error', message: controller.signal.aborted ? '기초 학습 연결이 지연되고 있어요. 다시 불러와 주세요.' : error instanceof Error ? error.message : '기초 학습을 불러오지 못했어요.' } }) },
    ).finally(() => clearTimeout(timeout))
    })
    return () => { if (active.current === controller) active.current = null; clearTimeout(timeout); controller.abort() }
  }, [chatId, transitionId, key])
  const state: State = response?.key === key ? response.state : { status: 'loading' }
  return { state, reload: () => setCycle(value => value + 1) }
}
