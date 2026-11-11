import type { BackendClient } from './client.ts'
import { deleteBackendData, fetchBackendHistory } from './history.ts'
import type { HistoryItem } from '../../types/history.ts'

type Snapshot = { items: HistoryItem[]; status: 'loading' | 'ready' | 'error'; error: string }
export type RailwayDeleteSelection = { guest: string; chatId?: number }

export function createRailwayHistoryController(client: BackendClient) {
  const listeners = new Set<() => void>()
  let state: Snapshot = { items: [], status: 'loading', error: '' }
  let owner: string | null = null
  let list: AbortController | null = null
  let deletion: AbortController | null = null
  const removed = new Set<string>()

  function publish(next: Snapshot) {
    state = next
    listeners.forEach(listener => listener())
  }
  function stopList() {
    list?.abort()
    list = null
  }
  function invalidate(error = '') {
    stopList()
    invalidateOwner()
    publish(error ? { ...state, status: 'error', error } : state)
  }
  async function refresh() {
    stopList()
    const controller = new AbortController()
    list = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
    if (!owner || !client.isGuest(owner)) invalidateOwner()
    publish({ ...state, status: 'loading', error: '' })
    try {
      const guest = await client.ensureSession(signal)
      if (list !== controller) return
      if (owner !== guest) invalidateOwner()
      owner = guest
      const items = await fetchBackendHistory(client, guest, signal)
      if (list === controller && client.isGuest(guest)) {
        publish({ items: items.filter(item => !removed.has(item.id)), status: 'ready', error: '' })
      }
    } catch {
      if (list === controller) publish({ ...state, status: 'error', error: '학습 기록을 불러오지 못했어요. 다시 시도해 주세요.' })
    } finally {
      if (list === controller) list = null
    }
  }
  function invalidateOwner() {
    owner = null
    removed.clear()
    state = { items: [], status: 'loading', error: '' }
  }
  function select(chatId?: string): RailwayDeleteSelection | null {
    if (!owner || !client.isGuest(owner)) return null
    if (chatId !== undefined && !state.items.some(item => item.id === chatId)) return null
    return { guest: owner, ...(chatId === undefined ? {} : { chatId: Number(chatId) }) }
  }
  async function confirm(selection: RailwayDeleteSelection, onDeleted: (chatId?: number) => void) {
    if (deletion) return false
    const { guest, chatId } = selection
    if (owner !== guest || !client.isGuest(guest) ||
        (chatId !== undefined && !state.items.some(item => item.id === String(chatId)))) throw new Error('Delete selection expired')
    const controller = new AbortController()
    deletion = controller
    try {
      await deleteBackendData(client, guest, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), chatId)
      stopList()
      if (chatId === undefined) {
        invalidate()
        onDeleted()
        client.forgetGuest(guest)
      } else {
        removed.add(String(chatId))
        publish({ items: state.items.filter(item => item.id !== String(chatId)), status: 'ready', error: '' })
        onDeleted(chatId)
      }
      void refresh()
      return true
    } finally {
      if (deletion === controller) deletion = null
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh, invalidate, select, confirm,
    stop() {
      stopList()
      deletion?.abort()
      deletion = null
    },
  }
}
