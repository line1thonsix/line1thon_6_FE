import { useEffect, useRef, useState } from 'react'
import { fetchMockAnalysis, retryMockAnalysis } from '../api/analysis'
import { watchAnalysis } from '../api/watchAnalysis'
import type { AnalysisSnapshot, AnalysisCompletion, MockAnalysisRetryRequest } from '../types/analysis'

export function useAnalysis(chatId: string, initialJobId: string | null) {
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [cycle, setCycle] = useState(0)
  const stop = useRef<(() => void) | null>(null)
  const retryController = useRef<AbortController | null>(null)
  const retryRequest = useRef<MockAnalysisRetryRequest | null>(null)
  const paused = useRef(false)
  useEffect(() => {
    if (!initialJobId || paused.current) return
    stop.current = watchAnalysis({
      fetchStatus: signal => fetchMockAnalysis(chatId, signal),
      onStatus: value => { if (!paused.current) { setSnapshot(value); setConnectionError(false) } },
      onError: () => setConnectionError(true),
    })
    return () => { stop.current?.(); stop.current = null }
  }, [chatId, initialJobId, cycle])
  useEffect(() => () => { const controller = retryController.current; retryController.current = null; controller?.abort() }, [])

  async function retry() {
    if (!snapshot || snapshot.status !== 'FAILED' || snapshot.attempt >= 3 || retryController.current) return
    const controller = new AbortController()
    retryController.current = controller
    stop.current?.()
    setRetrying(true)
    setConnectionError(false)
    // Reuse the same request on an uncertain acknowledgement; never consume an extra attempt.
    if (retryRequest.current?.jobId !== snapshot.jobId) {
      retryRequest.current = { jobId: snapshot.jobId, clientRequestId: crypto.randomUUID() }
    }
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const next = await retryMockAnalysis(chatId, retryRequest.current, controller.signal)
      if (retryController.current === controller) setSnapshot(next)
    } catch {
      if (retryController.current === controller) setConnectionError(true)
    } finally {
      clearTimeout(timeout)
      if (retryController.current === controller) {
        retryController.current = null
        setRetrying(false)
        // Reconcile server status even if a retry acknowledgement was lost.
        setCycle(value => value + 1)
      }
    }
  }
  const completion: AnalysisCompletion | null = snapshot?.status === 'DONE'
    ? { chatId, jobId: snapshot.jobId, resultId: snapshot.resultId } : null
  return { snapshot, connectionError, retrying, retry, completion,
    pause: () => { paused.current = true; stop.current?.(); const controller = retryController.current; retryController.current = null; controller?.abort() },
    reconnect: () => { if (!retryController.current) setCycle(value => value + 1) },
  }
}

export type AnalysisController = ReturnType<typeof useAnalysis>
