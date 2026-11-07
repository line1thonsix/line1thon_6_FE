let unavailable = false
const listeners = new Set<() => void>()
export const storageUnavailable = () => unavailable
export function subscribeStorage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
// Tab-scoped drafts and identifiers only. Never cache answers or comparison results here.
export function readSession(key: string): unknown {
  try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') } catch { return null }
}
export function writeSession(key: string, value: unknown): boolean {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
    return true
  } catch { unavailable = true; listeners.forEach(listener => listener()); return false }
}
export const workspaceKey = (mock: boolean) => `deveil:${mock ? 'mock' : 'api'}:workspace:v1`
export const thoughtKey = (chatId: string) => `deveil:thought-draft:v1:${chatId}`
