import { displayedHint, readViewedHint } from '../api/hintNavigation'
import { restoredHelpTab } from '../data/helpTabs'
import type { HelpTab } from '../data/helpTabs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { transitionMockBasicLearning } from '../api/basicLearning'
import { requestMockHints } from '../api/hints'
import { readSession, writeSession } from '../storage/session'
import type { HintState, HintInput, StuckPoint } from '../types/hints'

export function useHints(chatId: string, canTransition: () => boolean) {
  const transitionKey = `deveil:mock:basic-request:v1:${chatId}`
  const [initialRequest] = useState(() => { const raw = readSession(transitionKey); return typeof raw === 'string' && raw ? raw : null })
  const requestId = useRef<string | null>(initialRequest)
  const [uncertain, setUncertain] = useState(!!initialRequest)
  const [transitionError, setTransitionError] = useState('')
  const [transitioning, setTransitioning] = useState(false)
  const basicActive = useRef<AbortController | null>(null)
  const key = `deveil:mock:hint-tab:v1:${chatId}`
  const [tab, setTab] = useState<HelpTab>(() => restoredHelpTab(readSession(key)))
  const viewKey = `deveil:mock:hint-view:v1:${chatId}`
  const [viewed, setViewed] = useState(() => readViewedHint(readSession(viewKey)))
  const [state, setState] = useState<HintState | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  const retryInput = useRef<HintInput | undefined>(undefined)
  const run = useCallback(async (input?: HintInput) => {
    if (active.current || basicActive.current) return
    const controller = new AbortController()
    active.current = controller
    retryInput.current = input
    setBusy(true); setError('')
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const next = await requestMockHints(chatId, controller.signal, input)
      if (active.current === controller) {
        setState(next)
        if (input && 'level' in input) { setViewed(input.level); writeSession(viewKey, input.level) }
        if (next.basicLearning) { requestId.current = null; writeSession(transitionKey, null); setUncertain(false) }
        return next
      }
    } catch (error) {
      if (active.current === controller) setError(error instanceof Error ? error.message : '힌트를 불러오지 못했어요.')
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) { active.current = null; setBusy(false) }
    }
  }, [chatId, transitionKey, viewKey])
  useEffect(() => {
    const lifecycle = new AbortController()
    queueMicrotask(() => { if (!lifecycle.signal.aborted) void run() })
    return () => { lifecycle.abort(); const controller = active.current; active.current = null; controller?.abort(); const basic = basicActive.current; basicActive.current = null; basic?.abort() }
  }, [run])
  async function transition(confirmedState = state) {
    if (active.current || basicActive.current || !canTransition() || confirmedState?.basicLearning) return
    if (confirmedState?.level !== 2) return
    const controller = new AbortController()
    basicActive.current = controller
    if (!requestId.current) requestId.current = crypto.randomUUID()
    writeSession(transitionKey, requestId.current)
    setTransitioning(true); setUncertain(true); setTransitionError('')
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const saved = await transitionMockBasicLearning(chatId, requestId.current, controller.signal)
      if (basicActive.current !== controller) return
      setState(current => current ? { ...current, basicLearning: saved } : current)
      requestId.current = null; writeSession(transitionKey, null); setUncertain(false)
    } catch (error) {
      if (basicActive.current === controller) setTransitionError(error instanceof Error ? error.message : '전환 상태를 다시 확인해 주세요.')
    } finally {
      clearTimeout(timeout)
      if (basicActive.current === controller) { basicActive.current = null; setTransitioning(false) }
    }
  }
  function select(next: typeof tab) {
    writeSession(key, next); setTab(next)
    if (next === 'hints' && !requestId.current && state?.level === 0 && !error) void run({ level: 1 })
  }
  function view(level: 1 | 2) {
    if (active.current || basicActive.current || requestId.current || !state?.hints.some(hint => hint.level === level)) return
    setViewed(level); writeSession(viewKey, level)
  }
  return { currentHint: displayedHint(state, viewed), viewFirst: () => view(1), tab, state, busy: busy || transitioning, error, select, transitioning, uncertain, transitionError,
    transitionBlocked: uncertain || transitioning,
    canWrite: () => !requestId.current && !basicActive.current && !state?.basicLearning,
    transition: () => transition(),
    recheckTransition: async () => { const next = await run(); if (next && !next.basicLearning) await transition(next) },
    openFirst: () => { if (!requestId.current && state?.level === 0) void run({ level: 1 }) },
    openSecond: () => { if (state?.level === 2) view(2); else if (!requestId.current && state?.level === 1) void run({ level: 2 }) },
    choose: (stuckPoint: StuckPoint) => { if (!requestId.current && state && state.level > 0) void run({ stuckPoint }) },
    retry: () => { void run(retryInput.current) },
  }
}
