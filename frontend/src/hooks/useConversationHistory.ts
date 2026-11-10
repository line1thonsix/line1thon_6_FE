import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMockHistory } from '../api/history'
import { withDemoReflections } from '../api/historyState'
import { demoNotesKey } from '../storage/postResultDemo'
import { readSession } from '../storage/session'
import { subscribeHistoryChange } from '../storage/historyEvents'
import type { HistoryItem } from '../types/history'

export function useConversationHistory() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; items: HistoryItem[]; error: string }>({ status: 'loading', items: [], error: '' })
  const active = useRef<AbortController | null>(null)
  const refresh = useCallback(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setState(previous => ({ ...previous, status: 'loading', error: '' }))
    const timeout = setTimeout(() => controller.abort(), 10000)
    void fetchMockHistory(controller.signal).then(items => {
      if (active.current === controller && !controller.signal.aborted) setState({ status: 'ready', items: withDemoReflections(items, id => readSession(demoNotesKey(id))), error: '' })
    }).catch(() => {
      if (active.current === controller) setState(previous => ({ ...previous, status: 'error', error: '학습 기록을 불러오지 못했어요. 다시 시도해 주세요.' }))
    }).finally(() => { clearTimeout(timeout); if (active.current === controller) active.current = null })
  }, [])
  useEffect(() => {
    const lifecycle = new AbortController()
    queueMicrotask(() => { if (!lifecycle.signal.aborted) refresh() })
    const unsubscribe = subscribeHistoryChange(refresh)
    return () => { lifecycle.abort(); unsubscribe(); const current = active.current; active.current = null; current?.abort() }
  }, [refresh])
  return { ...state, refresh }
}
