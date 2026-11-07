import { redactValue } from '../security/redaction.ts'
import { notifyRedaction } from '../security/redactionNotice.ts'
let unavailable = false
const listeners = new Set<() => void>()
export const storageUnavailable = () => unavailable
export function subscribeStorage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
// Tab-scoped drafts and identifiers only. Never cache answers or comparison results here.
export function readSession(key: string): unknown {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    const safe = redactValue(raw)
    if (safe.redacted) { notifyRedaction(); writeSession(key, safe.value) }
    return safe.value
  } catch { return null }
}
export function writeSession(key: string, value: unknown): boolean {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else {
      const safe = redactValue(value)
      if (safe.redacted) notifyRedaction()
      sessionStorage.setItem(key, JSON.stringify(safe.value))
    }
    return true
  } catch { unavailable = true; listeners.forEach(listener => listener()); return false }
}
export const workspaceKey = (mock: boolean) => `deveil:${mock ? 'mock' : 'api'}:workspace:v1`
export const thoughtKey = (chatId: string) => `deveil:thought-draft:v1:${chatId}`

// Upgrade existing Deveil drafts/Mock metadata only; never touch another application's keys.
export function sanitizeExistingSessions() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter((key): key is string => !!key?.startsWith('deveil:'))
    for (const key of keys) readSession(key)
  } catch { /* Storage denial is handled on the next attempted write. */ }
}
