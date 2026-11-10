import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cancelMockAnalysis } from '../api/analysisCancellation'
import type { CancellationRequest, CancellationTarget } from '../api/analysisCancellation'
import { readSession, writeSession } from '../storage/session'

export function useAnalysisCancellation(chatId: string, target: CancellationTarget | null, pause: () => void, reconcile: () => void, scope: 'SELF' | 'BASIC' = 'SELF') {
  const key = `deveil:mock:analysis-cancel:v1:${chatId}`
  const [initial] = useState(() => {
    const v = readSession(key) as Partial<CancellationRequest> | null
    return v && v.learningPath === scope && typeof v.jobId === 'string' && v.jobId && typeof v.clientRequestId === 'string' && v.clientRequestId && v.clientRequestId.length <= 100 ? v as CancellationRequest : null
  })
  const request = useRef<CancellationRequest | null>(initial)
  const active = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(!!initial)
  const [error, setError] = useState('')
  const latest = useRef({ target, pause, reconcile })
  useLayoutEffect(() => { latest.current = { target, pause, reconcile } }, [target, pause, reconcile])
  const run = useCallback(async () => {
    if (active.current || (!request.current && !latest.current.target)) return
    request.current ??= { ...latest.current.target!, clientRequestId: crypto.randomUUID() }
    writeSession(key, request.current)
    latest.current.pause()
    const controller = new AbortController(); active.current = controller
    setBusy(true); setUncertain(true); setError('')
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      await cancelMockAnalysis(chatId, request.current, controller.signal)
      if (active.current !== controller) return
      request.current = null; writeSession(key, null)
      // Re-read authoritative state for both cancellation and completion-first races.
      latest.current.reconcile()
    } catch (error) {
      if (active.current === controller) setError(error instanceof Error ? error.message : '다시 시도해 주세요.')
    } finally {
      clearTimeout(timer)
      if (active.current === controller) { active.current = null; setBusy(false) }
    }
  }, [chatId, key])
  useEffect(() => {
    const lifecycle = new AbortController()
    queueMicrotask(() => { if (!lifecycle.signal.aborted && initial) void run() })
    return () => { lifecycle.abort(); const previous = active.current; active.current = null; previous?.abort() }
  }, [initial, run])
  return { busy, uncertain, error, cancel: run, reconcile }
}
