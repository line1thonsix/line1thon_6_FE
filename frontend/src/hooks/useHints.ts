import { useCallback, useEffect, useRef, useState } from 'react'
import { requestMockHints } from '../api/hints'
import { readSession, writeSession } from '../storage/session'
import type { HintState, StuckPoint } from '../types/hints'

export function useHints(chatId: string) {
  const key = `deveil:mock:hint-tab:v1:${chatId}`
  const [tab, setTab] = useState<'choices' | 'example' | 'hints'>(() => {
    const saved = readSession(key)
    return saved === 'hints' || saved === 'example' ? saved : 'choices'
  })
  const [state, setState] = useState<HintState | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  const retryInput = useRef<{ level: 1 | 2 } | { stuckPoint: StuckPoint } | undefined>(undefined)
  const run = useCallback(async (input?: { level: 1 | 2 } | { stuckPoint: StuckPoint }) => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    retryInput.current = input
    setBusy(true); setError('')
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const next = await requestMockHints(chatId, controller.signal, input)
      if (active.current === controller) setState(next)
    } catch (error) {
      if (active.current === controller) setError(error instanceof Error ? error.message : '힌트를 불러오지 못했어요.')
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) { active.current = null; setBusy(false) }
    }
  }, [chatId])
  useEffect(() => {
    const lifecycle = new AbortController()
    queueMicrotask(() => { if (!lifecycle.signal.aborted) void run() })
    return () => { lifecycle.abort(); const controller = active.current; active.current = null; controller?.abort() }
  }, [run])
  function select(next: typeof tab) {
    writeSession(key, next); setTab(next)
    if (next === 'hints' && state?.level === 0 && !error) void run({ level: 1 })
  }
  return { tab, state, busy, error, select,
    openFirst: () => { if (state?.level === 0) void run({ level: 1 }) },
    openSecond: () => { if (state?.level === 1) void run({ level: 2 }) },
    choose: (stuckPoint: StuckPoint) => { if (state && state.level > 0) void run({ stuckPoint }) },
    retry: () => { void run(retryInput.current) },
  }
}
