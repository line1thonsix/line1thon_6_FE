import { useEffect, useState, useSyncExternalStore } from 'react'
import { createFollowUpController } from '../api/followUpController'
import { fetchMockFollowUps } from '../api/followUps'
import { readSession, writeSession } from '../storage/session'
import { announceHistoryChange } from '../storage/historyEvents'

export function useFollowUps(chatId: string, enabled = true) {
  const [controller] = useState(() => {
    const key = `deveil:mock:follow-up-draft:v1:${chatId}`
    return createFollowUpController(chatId, {
      read: () => readSession(key), write: value => { writeSession(key, value) },
      fetch: async (signal, body) => {
        const result = await fetchMockFollowUps(chatId, signal, body)
        if (body && !signal.aborted) announceHistoryChange()
        return result
      }, id: () => crypto.randomUUID(),
    })
  })
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  useEffect(() => {
    let current = true
    queueMicrotask(() => { if (current && enabled) void controller.load() })
    return () => { current = false; controller.cancel() }
  }, [controller, enabled])
  return { state, change: controller.change, submit: controller.submit, retry: controller.retry }
}
